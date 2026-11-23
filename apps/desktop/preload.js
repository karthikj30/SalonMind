// Nothing from Node is exposed to the website; this only tells pages they run inside the desktop app.
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("salonmindApp", { shell: "desktop" });
