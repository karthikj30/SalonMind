"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Mic, MicOff, SendHorizontal, Volume2, VolumeX, X } from "lucide-react";
import type { VoiceAction, VoiceContext, VoiceField, VoiceForm } from "@/lib/domain/voice";

/** Recognition languages (BCP-47). Chrome / Edge / Safari recognise these on-device or via their speech service. */
const SPEECH_LANGS: [string, string][] = [
  ["en-IN", "English"], ["hi-IN", "हिन्दी"], ["bn-IN", "বাংলা"], ["mr-IN", "मराठी"], ["te-IN", "తెలుగు"], ["ta-IN", "தமிழ்"],
  ["gu-IN", "ગુજરાતી"], ["ur-IN", "اردو"], ["kn-IN", "ಕನ್ನಡ"], ["ml-IN", "മലയാളം"], ["pa-IN", "ਪੰਜਾਬੀ"], ["or-IN", "ଓଡ଼ିଆ"], ["as-IN", "অসমীয়া"],
];
/** Whisper language names (Odia is not in Whisper's list → auto-detect). */
const WHISPER_LANG: Record<string, string> = {
  en: "english", hi: "hindi", bn: "bengali", mr: "marathi", te: "telugu", ta: "tamil", gu: "gujarati", ur: "urdu", kn: "kannada", ml: "malayalam", pa: "punjabi", as: "assamese",
};
/** Hugging Face transformers.js (pinned) + the multilingual Whisper model, run fully in the browser — free, no key, audio never leaves the device. */
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1";
const ON_DEVICE_MODEL = "onnx-community/whisper-base";
type Asr = (audio: Float32Array, o: { language?: string; task: string }) => Promise<{ text?: string }>;
let asrLoad: Promise<Asr> | null = null;
async function onDeviceTranscribe(blob: Blob, lang: string, status: (s: string) => void): Promise<string> {
  if (!asrLoad) {
    asrLoad = (async () => {
      const url = TRANSFORMERS_URL;
      const tf = (await import(/* webpackIgnore: true */ url)) as { pipeline: (task: string, model: string, o: object) => Promise<Asr> };
      return tf.pipeline("automatic-speech-recognition", ON_DEVICE_MODEL, {
        dtype: "q8",
        progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
          if (p.status === "progress" && p.file?.endsWith(".onnx") && typeof p.progress === "number") status(`Downloading the on-device speech model (one time)… ${Math.round(p.progress)}%`);
        },
      });
    })().catch((e) => { asrLoad = null; throw e; });
  }
  const asr = await asrLoad;
  status("Recognising speech on this device…");
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = (await ctx.decodeAudioData(await blob.arrayBuffer())).getChannelData(0);
    const out = await asr(audio, { language: WHISPER_LANG[lang], task: "transcribe" });
    return String(out?.text ?? "").replace(/\[[^\]]*\]|\([^)]*\)/g, "").trim(); // drop "[Music]" style tags
  } finally { void ctx.close(); }
}
type Line = { who: "you" | "ai"; text: string };
type Rec = { lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number; start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };

const ROOT = "data-voice-assistant";
const visible = (el: Element) => !!(el as HTMLElement).offsetParent || getComputedStyle(el).position === "fixed";
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function labelOf(el: HTMLElement): string {
  const id = el.getAttribute("id");
  const own = el.closest("label") ?? (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null);
  if (own) {
    const c = own.cloneNode(true) as HTMLElement;
    c.querySelectorAll("input, select, textarea, button, [data-hint]").forEach((n) => n.remove());
    const t = clean(c.textContent);
    if (t) return t.slice(0, 80);
  }
  return clean(el.getAttribute("aria-label")) || clean(el.getAttribute("placeholder")).slice(0, 60) || (el.getAttribute("name") ?? "").replace(/_/g, " ");
}

/** Describe the forms and buttons currently on screen (names and labels only — never the values typed in them). */
function readPage(path: string): { ctx: VoiceContext; forms: HTMLFormElement[] } {
  const forms = [...document.querySelectorAll<HTMLFormElement>("form")].filter((f) => !f.closest(`[${ROOT}]`) && visible(f));
  const meta: VoiceForm[] = [];
  const fields: VoiceField[] = [];
  forms.forEach((form, index) => {
    const controls = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input[name], select[name], textarea[name]")]
      .filter((c) => !["hidden", "submit", "button", "file", "password", "image", "reset"].includes(c.type) && visible(c) && !c.disabled);
    const heading = form.getAttribute("aria-label") || form.closest("section, [role=dialog], details")?.querySelector("h1, h2, h3, summary")?.textContent || form.querySelector("button[type=submit], button:not([type])")?.textContent;
    const danger = !!form.querySelector("input[name=confirm]") || /delete|remove|erase/i.test(form.textContent ?? "");
    meta.push({ index, title: clean(heading).slice(0, 80), danger });
    const seen = new Set<string>();
    for (const c of controls) {
      if (seen.has(c.name)) continue; // radio groups / repeated names: first one
      seen.add(c.name);
      fields.push({ form: index, name: c.name, label: labelOf(c), type: c.type,
        options: c instanceof HTMLSelectElement ? [...c.options].slice(0, 40).map((o) => ({ value: o.value, label: clean(o.textContent) })) : undefined });
    }
  });
  const buttons = [...new Set([...document.querySelectorAll<HTMLElement>("main button, main a[href], main summary, [role=dialog] button")]
    .filter((b) => !b.closest(`[${ROOT}]`) && visible(b)).map((b) => clean(b.getAttribute("aria-label") || b.textContent)).filter((t) => t.length > 1 && t.length <= 60))].slice(0, 60);
  return { ctx: { path, forms: meta, fields, buttons }, forms };
}

/** Set a value the way a person would, so both plain and React-controlled inputs notice the change. */
function setValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    const want = value !== "off";
    if (el.checked !== want) el.click();
  } else {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("voice-filled");
  window.setTimeout(() => el.classList.remove("voice-filled"), 2500);
}

/**
 * Voice Agent UI — a microphone button on every signed-in page (and on sign-in / sign-up / onboarding).
 * Speech → text happens in the browser when it can (free, no key); otherwise audio goes to the server's free Whisper.
 * Commands can also be typed. The agent fills and navigates; it only submits when the user says "save".
 */
export function VoiceAssistant({ defaultLang = "en" }: { defaultLang?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mini, setMini] = useState(false); // after acting, shrink to a one-line pill so the page stays visible
  const [lang, setLang] = useState("en-IN");
  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState(""); // model download / recognition progress
  const useRecorder = useRef(false); // set when the browser's own recognition is missing or fails for this language
  const rec = useRef<Rec | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const lastForm = useRef(0);
  const pathRef = useRef(pathname);
  const pending = useRef<string | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  pathRef.current = pathname;

  useEffect(() => {
    try {
      setLang(localStorage.getItem("sm_voice_lang") || SPEECH_LANGS.find(([c]) => c.startsWith(defaultLang))?.[0] || "en-IN");
      setSpeak(localStorage.getItem("sm_voice_speak") === "1");
      // after a reload / new page the assistant comes back as the small pill, never covering the page
      if (sessionStorage.getItem("sm_voice_open") === "1") { setOpen(true); setMini(true); }
    } catch { /* storage blocked */ }
  }, [defaultLang]);
  useEffect(() => { try { sessionStorage.setItem("sm_voice_open", open ? "1" : "0"); } catch { /* */ } }, [open]);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: "end" }); }, [lines, interim]);

  const say = useCallback((text: string) => {
    setLines((l) => [...l.slice(-30), { who: "ai", text }]);
    if (!speak || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      window.speechSynthesis.speak(u);
    } catch { /* no voices installed */ }
  }, [speak, lang]);

  const run = useCallback(async (actions: VoiceAction[], forms: HTMLFormElement[]) => {
    let navigated = false;
    for (const a of actions) {
      if (a.type === "navigate") { router.push(a.path); navigated = true; }
      else if (a.type === "fill") {
        const el = forms[a.form]?.elements.namedItem(a.name);
        const target = el instanceof RadioNodeList ? (el[0] as HTMLInputElement) : (el as HTMLInputElement | null);
        if (target) { setValue(target, a.value); lastForm.current = a.form; }
      } else if (a.type === "submit") {
        const f = forms[a.form === -1 ? lastForm.current : a.form];
        if (f && !f.querySelector("input[name=confirm]")) window.setTimeout(() => f.requestSubmit(), 350); // let the user see the filled form first
      } else if (a.type === "click") {
        const b = [...document.querySelectorAll<HTMLElement>("main button, main a[href], main summary, [role=dialog] button")]
          .find((x) => !x.closest(`[${ROOT}]`) && visible(x) && clean(x.getAttribute("aria-label") || x.textContent) === a.label);
        b?.click();
      } else if (a.type === "theme") {
        try { localStorage.setItem("theme", a.mode); } catch { /* */ }
        document.documentElement.classList.toggle("dark", a.mode === "dark");
        document.documentElement.classList.toggle("light", a.mode === "light");
        window.dispatchEvent(new Event("sm-theme"));
      } else if (a.type === "scroll") {
        const top = a.dir === "top" ? 0 : a.dir === "bottom" ? document.body.scrollHeight : window.scrollY + (a.dir === "down" ? 1 : -1) * window.innerHeight * 0.8;
        window.scrollTo({ top, behavior: "smooth" });
      } else if (a.type === "back") router.back();
    }
    if (actions.some((a) => ["fill", "navigate", "click", "submit"].includes(a.type))) setMini(true);
    return navigated;
  }, [router]);

  const command = useCallback(async (text: string, skipNav = false) => {
    const t = text.trim();
    if (!t) return;
    if (!skipNav) setLines((l) => [...l.slice(-30), { who: "you", text: t }]);
    setBusy(true);
    try {
      const { ctx, forms } = readPage(pathRef.current);
      const r = await fetch("/api/voice/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t, lang: lang.slice(0, 2), ctx, skipNav }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { say(d.error ?? "Something went wrong."); return; }
      const navigated = await run(d.actions ?? [], forms);
      if (navigated) pending.current = t; // repeat on the new page so "add client name Meera" also fills the form there
      else if (d.say && !(skipNav && !(d.actions ?? []).length)) say(d.say);
      if (navigated && d.say) say(d.say);
    } catch { say("I couldn't reach the server."); }
    finally { setBusy(false); }
  }, [lang, run, say]);

  // after a voice navigation, give the new page a moment to render, then apply the rest of the sentence there
  useEffect(() => {
    const t = pending.current;
    if (!t) return;
    pending.current = null;
    const id = window.setTimeout(() => { void command(t, true); }, 900);
    return () => window.clearTimeout(id);
  }, [pathname, command]);

  const stop = useCallback(() => {
    rec.current?.stop();
    if (recorder.current?.state === "recording") recorder.current.stop();
    setListening(false);
  }, []);

  /** Record until ~1.2 s of silence after speech (or 10 s), then transcribe: server Whisper if configured, else on-device Whisper. */
  const recordAndTranscribe = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return say("This browser can't record audio — type the command instead.");
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return say("Microphone access is blocked — allow it in the browser, or type the command."); }
    const mr = new MediaRecorder(stream);
    recorder.current = mr;
    const chunks: Blob[] = [];
    // tiny voice-activity detector so the user does not have to tap "stop"
    const actx = new AudioContext();
    const an = actx.createAnalyser();
    actx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    let heard = false, quietSince = 0;
    const vad = window.setInterval(() => {
      an.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((a, x) => a + x * x, 0) / buf.length);
      if (rms > 0.02) { heard = true; quietSince = 0; } else if (heard) { quietSince ||= Date.now(); if (Date.now() - quietSince > 1200 && mr.state === "recording") mr.stop(); }
    }, 100);
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      window.clearInterval(vad); void actx.close();
      stream.getTracks().forEach((t) => t.stop());
      setListening(false); setBusy(true);
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      const code = lang.slice(0, 2);
      try {
        let text = "";
        const fd = new FormData();
        fd.set("audio", blob, "speech.webm");
        fd.set("lang", code);
        const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd }).catch(() => null);
        const d = res ? await res.json().catch(() => ({})) : {};
        if (res?.ok && d.text) text = d.text;
        else {
          try { text = await onDeviceTranscribe(blob, code, setNote); }
          catch { say(d.error ?? "Speech recognition is not available here — type the command instead."); }
        }
        setNote("");
        if (text) await command(text);
        else if (res?.ok || !d.error) say("I couldn't hear that — please try again.");
      } finally { setBusy(false); setNote(""); }
    };
    mr.start(); setListening(true);
    window.setTimeout(() => { if (mr.state === "recording") mr.stop(); }, 10_000);
  }, [lang, command, say]);

  const listen = useCallback(async () => {
    if (listening) return stop();
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    setInterim("");
    if (!SR || useRecorder.current) return recordAndTranscribe();
    const r = new SR();
    rec.current = r;
    r.lang = lang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let final = "";
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (final += e.results[i][0].transcript) : (live += e.results[i][0].transcript));
      setInterim(final + live);
    };
    r.onerror = (e) => {
      setListening(false);
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed") return say("Microphone access is blocked — allow it in the browser's address bar, or type the command.");
      // this browser cannot recognise the chosen language (or its speech service is unreachable): switch to Whisper
      useRecorder.current = true;
      say("Switching to Whisper speech recognition for this language — tap the microphone again.");
    };
    r.onend = () => { setListening(false); setInterim(""); if (final.trim()) void command(final); };
    try { r.start(); setListening(true); } catch { setListening(false); }
  }, [listening, stop, lang, command, say, recordAndTranscribe]);

  // commands typed in the Ctrl+K palette arrive here
  useEffect(() => {
    const onCmd = (e: Event) => { const t = (e as CustomEvent<string>).detail; if (typeof t === "string" && t.trim()) { setOpen(true); setMini(false); void command(t); } };
    window.addEventListener("sm-voice-command", onCmd);
    return () => window.removeEventListener("sm-voice-command", onCmd);
  }, [command]);

  // Alt+V toggles the microphone from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.altKey && e.key.toLowerCase() === "v") { e.preventDefault(); setOpen(true); void listen(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listen]);
  useEffect(() => () => { rec.current?.abort(); }, []);

  const lastReply = [...lines].reverse().find((l) => l.who === "ai")?.text ?? "";
  const replies = lines.filter((l) => l.who === "ai").length;
  // The inbox composer owns the bottom-right corner, so there the assistant sits top-right and opens downwards.
  const place = pathname === "/app/inbox" ? "top-[4.4rem] flex-col-reverse md:top-6" : `flex-col ${pathname.startsWith("/app") ? "bottom-[4.75rem] md:bottom-5" : "bottom-5"}`;
  return (
    <div {...{ [ROOT]: "" }} data-voice-count={replies} data-voice-reply={lastReply} className={`no-print pointer-events-none fixed right-3 z-40 flex items-end gap-2.5 sm:right-5 md:right-8 [&>*]:pointer-events-auto ${place}`}>
      {open && mini && (
        <div className="flex max-w-[min(20rem,calc(100vw-5rem))] animate-fade-up items-center gap-2 rounded-2xl border border-brand-100 bg-surface py-1.5 pl-3 pr-1.5 text-xs text-brand-900 shadow-lift" role="status">
          <button type="button" onClick={() => setMini(false)} className="line-clamp-2 flex-1 text-left" title="Show the conversation" dir="auto">{busy ? "Working…" : interim ? `${interim}…` : lastReply || "Listening when you tap the mic"}</button>
          <button type="button" onClick={() => void listen()} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Start listening"} className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${listening ? "animate-pulse bg-red-500" : "bg-rose-gold"}`}>{listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
        </div>
      )}
      {open && !mini && (
        <div role="dialog" aria-label="Voice assistant" className="flex max-h-[min(30rem,calc(100dvh-9rem))] w-[min(22rem,calc(100vw-1.5rem))] origin-bottom-right animate-scale-in flex-col overflow-hidden rounded-2xl border border-brand-100 bg-surface shadow-lift">
          <div className="flex items-center gap-2 bg-plum-gradient px-3 py-2.5 text-white">
            <Mic className="h-4 w-4" aria-hidden />
            <p className="flex-1 text-sm font-semibold">Voice assistant</p>
            <select value={lang} onChange={(e) => { setLang(e.target.value); useRecorder.current = false; try { localStorage.setItem("sm_voice_lang", e.target.value); } catch { /* */ } }} aria-label="Speech language" className="rounded-md bg-white/15 px-1.5 py-1 text-xs focus:outline-none [&>option]:text-ink">
              {SPEECH_LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
            <button type="button" onClick={() => { const n = !speak; setSpeak(n); try { localStorage.setItem("sm_voice_speak", n ? "1" : "0"); } catch { /* */ } if (!n) window.speechSynthesis?.cancel(); }} className="rounded-md p-1 hover:bg-white/15" aria-pressed={speak} aria-label={speak ? "Mute spoken replies" : "Speak replies aloud"} title={speak ? "Spoken replies on" : "Spoken replies off"}>
              {speak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => { stop(); setOpen(false); setMini(false); }} className="rounded-md p-1 hover:bg-white/15" aria-label="Close voice assistant"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-24 flex-1 space-y-1.5 overflow-y-auto bg-ivory-50 p-3 text-sm" aria-live="polite" data-voice-log>
            {!lines.length && !interim && (
              <div className="space-y-2 text-xs text-brand-900/65">
                <p>Tap the microphone and speak, or type below. I fill forms and open pages for you — I only save when you say <b>“save”</b>, and I never delete anything.</p>
                <div className="flex flex-wrap gap-1.5">
                  {["Open bookings", "Add client name Meera phone 98765 43210", "How many bookings today?", "Dark mode"].map((h) => (
                    <button key={h} type="button" onClick={() => void command(h)} className="rounded-full border border-brand-200 bg-surface px-2.5 py-1 text-[11px] text-brand-800 hover:bg-brand-50">{h}</button>
                  ))}
                </div>
              </div>
            )}
            {lines.map((l, i) => (
              <p key={i} dir="auto" className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 ${l.who === "you" ? "ml-auto rounded-br-md bg-rose-gold text-white" : "rounded-bl-md bg-surface text-brand-950 shadow-soft"}`} data-voice={l.who}>{l.text}</p>
            ))}
            {interim && <p dir="auto" className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-rose-gold/60 px-3 py-1.5 italic text-white">{interim}…</p>}
            {busy && <p className="flex items-center gap-1.5 text-xs text-brand-900/50" data-voice-status><Loader2 className="h-3.5 w-3.5 animate-spin" />{note || "Working…"}</p>}
            <div ref={logEnd} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); const t = typed; setTyped(""); void command(t); }} className="flex items-center gap-1.5 border-t border-brand-100 p-2">
            <button type="button" onClick={() => void listen()} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Start listening"} title="Alt + V"
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition active:scale-95 ${listening ? "animate-pulse bg-red-500" : "bg-rose-gold hover:brightness-110"}`}>
              {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={listening ? "Listening…" : "…or type a command"} aria-label="Type a command" dir="auto" className="min-w-0 flex-1 rounded-full border border-brand-100 bg-ivory-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
            <button type="submit" disabled={busy || !typed.trim()} aria-label="Run command" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-brand-700 hover:bg-brand-50 disabled:opacity-40"><SendHorizontal className="h-4 w-4" /></button>
          </form>
        </div>
      )}
      <button type="button" onClick={() => { if (open && mini) setMini(false); else { setOpen((o) => !o); setMini(false); } }} aria-expanded={open && !mini} aria-label="Voice assistant" title="Voice assistant (Alt + V)"
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-full bg-plum-gradient text-white shadow-lift ring-2 ring-white/20 transition hover:scale-105 active:scale-95 ${listening ? "animate-pulse" : ""}`}>
        <Mic className="h-5 w-5" />
      </button>
    </div>
  );
}
