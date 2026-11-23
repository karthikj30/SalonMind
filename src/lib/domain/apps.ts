/**
 * Native app shells (Android TWA, desktop Electron) load the live website, so features and fixes reach every
 * installed app on the next launch without reinstalling. The shell itself changes rarely; when it does, the site
 * offers a one-tap update that installs over the existing app (same signing key → data and sign-in are kept).
 */
export type AppVersions = { url: string; android: { applicationId: string; versionCode: number; versionName: string }; desktop: { version: string } };

/** Parse the shell cookie set by /open: "android:3", "desktop:1.2.0", "pwa". */
export function parseShell(raw: string | null | undefined): { kind: "android" | "desktop" | "pwa"; version: string } | null {
  const m = /^(android|desktop|pwa)(?::([0-9][0-9.]{0,15}))?$/.exec(raw ?? "");
  return m ? { kind: m[1] as "android" | "desktop" | "pwa", version: m[2] ?? "" } : null;
}

/** Compare dotted versions numerically ("1.10.0" > "1.9.3"). */
export function compareVersions(a: string, b: string) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** Is a newer shell available for the app this visitor is using? */
export function shellUpdate(shell: ReturnType<typeof parseShell>, latest: AppVersions): { kind: "android" | "desktop"; latest: string } | null {
  if (!shell || !shell.version) return null;
  if (shell.kind === "android" && Number(shell.version) < latest.android.versionCode) return { kind: "android", latest: latest.android.versionName };
  if (shell.kind === "desktop" && compareVersions(shell.version, latest.desktop.version) < 0) return { kind: "desktop", latest: latest.desktop.version };
  return null;
}

export const SHELL_COOKIE = "sm_shell";
export const APK_PATH = "/downloads/SalonMind.apk";
export const DESKTOP_RELEASES = "https://github.com/karthikj30/SalonMind/releases/latest";
