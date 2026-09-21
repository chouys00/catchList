import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseReport, deleteEntry, hasReportFiles, hideEntry, loadAllLibraries, undoHide, setFavorite, loadHiddenEntries, restoreHiddenEntry, setHiddenReason, favoriteBacklogEntry, undoHiddenReason } from "./library.js";
import { loadUpdateStatus } from "./update-status.js";
import { GameCoverCache, GameCoverService } from "./game-cover-cache.js";
import { resolveSteamCover } from "./steam-covers.js";
import { ReportCache } from "./report-cache.js";
import { VisitHistory } from "./visit-history.js";
import { ManualGameService } from "./manual-game-service.js";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const isolatedUserDataDir = process.env.CATCHLIST_USER_DATA_DIR?.trim();
if (isolatedUserDataDir) app.setPath("userData", path.resolve(isolatedUserDataDir));
let mainWindow;
let dataDir;
let lastOperation;
let gameCoverService;
const visits = new VisitHistory();
const reportCache = new ReportCache(parseReport);
const manualGames = new ManualGameService();
let activeMedia = "games";

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
  const visit = dataDir ? visits.annotate(dataDir, loadAllLibraries(dataDir, reportCache), activeMedia) : { libraries: [] };
  return {
    dataDir,
    appVersion: app.getVersion(),
    canUndo: Boolean(lastOperation),
    ...visit,
    hiddenEntries: dataDir ? loadHiddenEntries(dataDir, reportCache) : [],
    updateStatus: dataDir ? loadUpdateStatus(dataDir) : null,
  };
}

async function resolveGameCovers(appids) {
  if (!gameCoverService) {
    const cache = new GameCoverCache(path.join(app.getPath("userData"), "steam-cover-cache.json"));
    gameCoverService = new GameCoverService({ cache, resolveCover: resolveSteamCover });
  }
  return gameCoverService.resolve(appids);
}

function validExternalUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:") return false;
  return url.hostname === "www.google.com" || url.hostname === "store.steampowered.com" || url.hostname === "www.imdb.com";
}

function registerIpc() {
  ipcMain.handle("games:preview", (_event, input) => {
    if (!dataDir || activeMedia !== "games") throw new Error("請先開啟遊戲頁並選擇資料夾");
    return manualGames.prepare(dataDir, input);
  });
  ipcMain.handle("games:cancel-preview", () => { manualGames.cancel(); });
  ipcMain.handle("games:add", (_event, token) => {
    if (!dataDir || activeMedia !== "games") throw new Error("請先開啟遊戲頁");
    const appid = manualGames.commit(dataDir, token);
    return { ...snapshot(), addedAppid: appid };
  });
  ipcMain.handle("library:load", (_event, media) => {
    if (media !== "games") manualGames.cancel();
    if (["games", "anime", "movies", "liveAction"].includes(media)) activeMedia = media;
    return snapshot();
  });
  ipcMain.handle("library:set-favorite", (_event, media, entryId, favorite) => {
    if (!dataDir) throw new Error("尚未選擇資料夾");
    setFavorite(dataDir, media, entryId, favorite);
    return snapshot();
  });
  ipcMain.handle("library:set-hidden-reason", (_event, key, reason) => {
    if (!dataDir) throw new Error("尚未選擇資料夾");
    lastOperation = { kind: "reason", operation: setHiddenReason(dataDir, key, reason) };
    return snapshot();
  });
  ipcMain.handle("library:favorite-backlog", (_event, id) => {
    if (!dataDir) throw new Error("尚未選擇資料夾");
    favoriteBacklogEntry(dataDir, id);
    lastOperation = null;
    return snapshot();
  });
  ipcMain.handle("library:restore-hidden", (_event, hideKey) => {
    if (!dataDir) throw new Error("尚未選擇資料夾");
    restoreHiddenEntry(dataDir, hideKey);
    if (lastOperation?.operation.hideKey === hideKey) lastOperation = null;
    return snapshot();
  });
  ipcMain.handle("library:choose-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "選擇 CatchList 資料夾",
      properties: ["openDirectory"],
    });
    if (result.canceled) return snapshot();
    const selected = result.filePaths[0];
    if (!hasReportFiles(selected)) throw new Error("這個資料夾找不到 CatchList 報告或手動遊戲清單");
    manualGames.cancel();
    dataDir = selected;
    saveDirectory(dataDir);
    lastOperation = null;
    return snapshot();
  });
  ipcMain.handle("library:hide-entry", (_event, media, entryId, reason) => {
    if (!dataDir) throw new Error("尚未選擇資料夾");
    lastOperation = { kind: "hide", operation: hideEntry(dataDir, media, entryId, reason) };
    return snapshot();
  });
  ipcMain.handle("library:delete-entry", (_event, media, entryId) => {
    if (!dataDir) throw new Error("尚未選擇資料夾");
    deleteEntry(dataDir, media, entryId);
    lastOperation = null;
    return snapshot();
  });
  ipcMain.handle("library:undo-last-operation", () => {
    if (!lastOperation) throw new Error("沒有可復原的操作");
    const restored = lastOperation.kind === "reason" ? undoHiddenReason(dataDir, lastOperation.operation) : undoHide(dataDir, lastOperation.operation);
    lastOperation = null;
    return { ...snapshot(), restored };
  });
  ipcMain.handle("library:resolve-game-covers", (_event, appids) => {
    if (!Array.isArray(appids)) throw new Error("遊戲封面請求格式不正確");
    return resolveGameCovers(appids);
  });
  ipcMain.handle("clipboard:write-text", (_event, text) => {
    if (typeof text !== "string" || text.length === 0 || text.length > 10_000) throw new Error("無法複製遊戲名稱");
    clipboard.writeText(text);
    return true;
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
    title: `CatchList 閱讀器 ${app.getVersion()}`,
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
