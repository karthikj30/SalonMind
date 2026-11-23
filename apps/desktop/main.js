// SalonMind desktop: a window onto the live site, so every website release reaches the desktop app on its next
// launch — no reinstall. The shell only checks whether a newer shell exists and offers the download.
const { app, BrowserWindow, Menu, dialog, shell, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const shared = (() => {
  for (const p of [path.join(__dirname, "version.json"), path.join(__dirname, "..", "version.json")]) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { /* try next */ }
  }
  return { url: "https://salonmind-khaki.vercel.app" };
})();
const SITE = (process.env.SALONMIND_URL || shared.url).replace(/\/$/, "");
const ORIGIN = new URL(SITE).origin;
const VERSION = app.getVersion();

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 880, minWidth: 380, minHeight: 600,
    title: "SalonMind", backgroundColor: "#fbf8f4", show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, spellcheck: true },
  });
  win.once("ready-to-show", () => win.show());
  // salon pages stay in the app; WhatsApp, UPI, Google review and other links open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).origin === ORIGIN) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (new URL(url).origin !== ORIGIN) { e.preventDefault(); shell.openExternal(url); }
  });
  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, "offline.html"), { query: { retry: url || SITE } });
  });
  win.loadURL(`${SITE}/open?shell=desktop&v=${VERSION}`);
}

function compare(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
}

async function checkShellUpdate() {
  try {
    const res = await fetch(`${SITE}/api/app-version`, { cache: "no-store" });
    const v = await res.json();
    if (compare(VERSION, v.desktop.version) >= 0) return;
    const { response } = await dialog.showMessageBox(win, {
      type: "info", buttons: ["Download update", "Later"], defaultId: 0, cancelId: 1,
      title: "SalonMind update", message: `SalonMind ${v.desktop.version} is available (you have ${VERSION}).`,
      detail: "Your salon data lives online, so updating keeps everything — just run the new installer over this one.",
    });
    if (response === 0) shell.openExternal(v.downloads?.desktop || `${SITE}/download`);
  } catch { /* offline: try next launch */ }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    // voice commands need the microphone; grant it to the salon site only
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
      const fromSite = (details.requestingUrl || wc.getURL()).startsWith(ORIGIN);
      cb(fromSite && ["media", "clipboard-sanitized-write", "notifications", "fullscreen"].includes(permission));
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      { label: "File", submenu: [{ label: "Dashboard", accelerator: "CmdOrCtrl+Shift+D", click: () => win?.loadURL(`${SITE}/app`) }, { type: "separator" }, { role: "quit" }] },
      { role: "editMenu" },
      { label: "View", submenu: [{ role: "reload" }, { role: "forceReload" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
      { role: "windowMenu" },
    ]));
    createWindow();
    setTimeout(checkShellUpdate, 5000);
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
