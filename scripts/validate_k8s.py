#!/usr/bin/env python3
"""Static validation of deploy/k8s (runs in CI; no cluster needed).

Checks: every document parses and has apiVersion/kind/metadata.name; everything is in the salonmind
namespace; Kustomize lists every manifest; HPAs/Services/PDBs target workloads that exist; containers set
image, resource requests, a memory limit, liveness+readiness probes, non-root + no privilege escalation;
CronJob schedule is a valid 5-field cron; container images match the Dockerfiles in this repo.
"""
import pathlib, re, sys, yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent / "deploy" / "k8s"
errors, docs = [], []
for f in sorted(ROOT.glob("*.yaml")):
    for d in yaml.safe_load_all(f.read_text()):
        if d: docs.append((f.name, d))

def err(f, msg): errors.append(f"{f}: {msg}")

kust = next(d for f, d in docs if d.get("kind") == "Kustomization")
listed = set(kust["resources"])
for f in {f for f, d in docs if d.get("kind") not in ("Kustomization",)}:
    if f not in listed and f not in ("secret.example.yaml",): err(f, "not listed in kustomization.yaml resources")

workloads = {}
for f, d in docs:
    kind = d.get("kind")
    if kind == "Kustomization": continue
    for k in ("apiVersion", "kind", "metadata"):
        if k not in d: err(f, f"missing {k}")
    md = d.get("metadata", {})
    if not md.get("name"): err(f, f"{kind} without metadata.name")
    if kind != "Namespace" and md.get("namespace") != "salonmind": err(f, f"{kind}/{md.get('name')} not in namespace salonmind")
    if kind in ("Deployment", "CronJob"):
        workloads[(kind, md["name"])] = d
        spec = d["spec"]["template"]["spec"] if kind == "Deployment" else d["spec"]["jobTemplate"]["spec"]["template"]["spec"]
        if not spec.get("securityContext", {}).get("runAsNonRoot"): err(f, f"{md['name']}: pod must set runAsNonRoot")
        for c in spec["containers"]:
            if not c.get("image"): err(f, f"{c['name']}: no image")
            sc = c.get("securityContext", {})
            if sc.get("allowPrivilegeEscalation") is not False: err(f, f"{c['name']}: allowPrivilegeEscalation must be false")
            if "ALL" not in sc.get("capabilities", {}).get("drop", []): err(f, f"{c['name']}: must drop ALL capabilities")
            if kind == "Deployment":
                r = c.get("resources", {})
                if not r.get("requests", {}).get("cpu") or not r.get("requests", {}).get("memory"): err(f, f"{c['name']}: cpu+memory requests required (HPA needs them)")
                if not r.get("limits", {}).get("memory"): err(f, f"{c['name']}: memory limit required")
                for p in ("livenessProbe", "readinessProbe"):
                    if p not in c: err(f, f"{c['name']}: missing {p}")
                sel = d["spec"]["selector"]["matchLabels"]; lab = d["spec"]["template"]["metadata"]["labels"]
                if any(lab.get(k) != v for k, v in sel.items()): err(f, f"{md['name']}: selector does not match pod labels")
    if kind == "CronJob":
        if len(d["spec"]["schedule"].split()) != 5: err(f, "cron schedule must have 5 fields")

deployments = {n for (k, n) in workloads if k == "Deployment"}
labels = {d["spec"]["template"]["metadata"]["labels"].get("app.kubernetes.io/name") for (k, n), d in workloads.items() if k == "Deployment"}
for f, d in docs:
    kind, name = d.get("kind"), d.get("metadata", {}).get("name")
    if kind == "HorizontalPodAutoscaler":
        t = d["spec"]["scaleTargetRef"]["name"]
        if t not in deployments: err(f, f"HPA {name} targets missing deployment {t}")
        if d["spec"]["minReplicas"] > d["spec"]["maxReplicas"]: err(f, f"HPA {name}: min > max")
    if kind in ("Service", "PodDisruptionBudget"):
        sel = (d["spec"].get("selector") or {}).get("matchLabels", d["spec"].get("selector", {}))
        if sel.get("app.kubernetes.io/name") not in labels: err(f, f"{kind} {name} selects no workload")
    if kind == "Ingress":
        for rule in d["spec"]["rules"]:
            for p in rule["http"]["paths"]:
                svc = p["backend"]["service"]["name"]
                if not any(dd.get("kind") == "Service" and dd["metadata"]["name"] == svc for _, dd in docs): err(f, f"Ingress backend {svc} missing")

repo = ROOT.parent.parent
for img, dockerfile in (("salonmind-web", "Dockerfile"), ("salonmind-worker", "services/agent-worker/Dockerfile")):
    if not (repo / dockerfile).exists(): err("images", f"{img} has no {dockerfile}")
    if not any(img in c["image"] for (k, n), d in workloads.items() if k == "Deployment" for c in d["spec"]["template"]["spec"]["containers"]): err("images", f"{img} not deployed")

print(f"validated {len(docs)} documents in {ROOT.relative_to(repo)}: {len(workloads)} workloads")
if errors:
    print("\n".join("✘ " + e for e in errors)); sys.exit(1)
print("✔ all Kubernetes manifests valid")
