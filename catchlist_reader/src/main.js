import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deleteEntry, hasReportFiles, loadAllLibraries, undoDelete } from "./library.js";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let dataDir;
let lastDelete;

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readSavedDirectory() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8")).dataDir;
  } catch {
    return null;
  }
}

function saveDirectory(directory) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify({ dataDir: directory }, null, 2), "utf8");
}

function initialDirectory() {
  const cli = process.argv.find((arg) => arg.startsWith("--data-dir="))?.slice(11);
  const candidates = [
    cli,
    process.env.CATCHLIST_DATA_DIR,
    process.env.PORTABLE_EXECUTABLE_DIR,
    app.isPackaged ? path.dirname(process.execPath) : null,
    readSavedDirectory(),
    "G:\\我的雲端硬碟\\CatchList",
    process.cwd(),
  ];
  return candidates.find(hasReportFiles) ?? null;
}

function snapshot() {
  return {
    dataDir,
    canUndo: Boolean(lastDelete),
    libraries: dataDir ? loadAllLibraries(dataDir) : [],
  };
}

function validExternalUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:") return false;
  return url.hostname === "www.google.com" || url.hostname === "store.steampowered.com";
}

function registerIpc() {
  ipcMain.handle("library:load", () => snapshot());
  ipcMain.handle("library:choose-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "選擇 CatchList 資料夾",
      properties: ["openDirectory"],
    });
    if (result.canceled) return snapshot();
    const selected = result.filePaths[0];
    if (!hasReportFiles(selected)) throw new Error("這個資料夾找不到遊戲.md、動畫.md 或電影.md");
    dataDir = selected;
    saveDirectory(dataDir);
    lastDelete = null;
    return snapshot();
  });
  ipcMain.handle("library:delete-entry", (_event, media, entryId) => {
    if (!dataDir) throw new Error("尚未選擇資料夾");
    lastDelete = deleteEntry(dataDir, media, entryId);
    return snapshot();
  });
  ipcMain.handle("library:undo-delete", () => {
    if (!lastDelete) throw new Error("沒有可復原的刪除操作");
    const restored = undoDelete(lastDelete);
    lastDelete = null;
    return { ...snapshot(), restored };
  });
  ipcMain.handle("external:open-urls", async (_event, urls) => {
    if (!Array.isArray(urls) || urls.length > 250 || urls.some((url) => !validExternalUrl(url))) {
      throw new Error("外部連結不正確或數量過多");
    }
    for (const url of [...new Set(urls)]) await shell.openExternal(url, { activate: false });
    return true;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 360,
    minHeight: 620,
    backgroundColor: "#111315",
    icon: path.join(sourceDir, "assets", "catchlist.ico"),
    title: "CatchList 閱讀器",
    webPreferences: {
      preload: path.join(sourceDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.loadFile(path.join(sourceDir, "renderer", "index.html"));
}

app.whenReady().then(() => {
  dataDir = initialDirectory();
  registerIpc();
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
