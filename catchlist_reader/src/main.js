import { app, BrowserWindow, clipboard, dialog, ipcMain, session, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as wait } from "node:timers/promises";

import { setGameNote, parseReport, sourceEntries, deleteEntry, hasReportFiles, hideEntry, loadAllLibraries, undoHide, setFavorite, loadHiddenEntries, restoreHiddenEntry, setHiddenReason, favoriteBacklogEntry, undoHiddenReason } from "./library.js";
import { loadUpdateStatus } from "./update-status.js";
import { GameCoverCache, GameCoverService } from "./game-cover-cache.js";
import { resolveSteamCover } from "./steam-covers.js";
import { ReportCache } from "./report-cache.js";
import { VisitHistory } from "./visit-history.js";
import { ManualGameService } from "./manual-game-service.js";
import { GameRefreshService } from "./game-refresh-service.js";
import { SteamAccess } from "./steam-access.js";
import { SteamConfirmation } from "./steam-confirmation.js";
import { parseSteamInput } from "./steam-game-lookup.js";
import { GameBatchService } from "./game-batch-service.js";
import { CoverRequestLog } from "./cover-request-log.js";
import { GameScreenshots } from "./game-screenshots.js";
import { AnimeMediaService } from "./anime-media.js";
import { openExternalUrls } from "./external-links.js";
import { readAnimeSources, animeSourceKey } from "@catchlist/core/anime-sources.js";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const isolatedUserDataDir = process.env.CATCHLIST_USER_DATA_DIR?.trim();
if (isolatedUserDataDir) app.setPath("userData", path.resolve(isolatedUserDataDir));
let mainWindow;
let dataDir;
let lastOperation;
let gameCoverService;
let coverRequestLog;
let animeMediaService;
let gameScreenshots;

function animeService() {
  return animeMediaService ??= new AnimeMediaService(path.join(app.getPath("userData"), "anime-media-cache.json"));
}

function animeEntry(id) {
  if (!dataDir || typeof id !== "string") throw new Error("請先開啟動畫清單");
  const entry = sourceEntries(dataDir, "anime", { reportCache }).entries.find(item => item.id === id);
  if (!entry) throw new Error("清單已變更，請重新開啟動畫頁");
  try { return { ...entry, sourceRecord: readAnimeSources(dataDir).records[animeSourceKey(entry)] }; }
  catch { return { ...entry, sourceWarning: "動畫來源檔無法讀取，請檢查資料檔" }; }
}
const visits = new VisitHistory();
const reportCache = new ReportCache(parseReport);
let steamAccess;
function steamService() { return steamAccess ??= new SteamAccess({ getParent: () => mainWindow }); }
async function waitForSteamSlot(service, signal) {
  const remaining = service.nextRequest - Date.now();
  if (remaining > 1500) throw new Error("Steam 暫時限制請求，請稍後重新讀取");
  if (remaining > 0) await wait(remaining, undefined, { signal });
}
const openSteam = options => steamService().open(options);
openSteam.focus = () => steamService().focus();
const steamConfirmation = new SteamConfirmation({ open: openSteam });
let manualEpoch = 0;
let directoryEpoch = 0;
const manualGames = new ManualGameService({ lookup: (input, options) => steamService().lookupGame(input, options) });
const gameRefresh = new GameRefreshService({ lookup: (input, options) => steamService().lookupStats(input, options) });
const gameBatch = new GameBatchService();
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
    gameCoverService = new GameCoverService({
      cache,
      resolveCover: (appid) => {
        coverRequestLog?.recordDetailRequest(appid);
        return resolveSteamCover(appid);
      },
    });
  }
  return gameCoverService.resolve(appids);
}

function registerIpc() {
  const trusted = event => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error("不允許的閱讀器操作來源");
  };
  ipcMain.handle("steam:confirm", (event, requestId) => { trusted(event); return steamConfirmation.start(requestId); });
  ipcMain.handle("steam:cancel", (event, requestId) => { trusted(event); steamConfirmation.cancel(null, requestId); });
  ipcMain.handle("steam:status", event => { trusted(event); return steamService().status(); });
  ipcMain.handle("steam:clear", async event => {
    trusted(event);
    if (steamConfirmation.request?.promise) throw new Error("請先完成或取消 Steam 確認");
    const answer = await dialog.showMessageBox(mainWindow, { type: "question", title: "清除 Steam 網頁資料", message: "清除閱讀器內的 Steam 登入與確認狀態？",
      detail: "下次可能需要重新登入或確認。清單、收藏與個人紀錄不受影響。", buttons: ["取消", "清除網頁資料"], defaultId: 0, cancelId: 0 });
    if (answer.response !== 1) return { ...await steamService().status(), cancelled: true };
    steamConfirmation.cancel();
    return steamService().clear();
  });
  ipcMain.handle("games:refresh", async (event, input) => {
    trusted(event);
    if (!dataDir) throw new Error("請先選擇資料夾");
    const appid = parseSteamInput(input);
    const directory = dataDir;
    const epoch = directoryEpoch;
    const valid = () => dataDir === directory && epoch === directoryEpoch;
    try { await gameRefresh.refresh(directory, appid, { valid }); return snapshot(); }
    catch (error) {
      if (error.code !== "STEAM_VERIFICATION_REQUIRED") throw error;
      const title = sourceEntries(directory, "games", { strict: true }).entries.find(entry => entry.appid === appid)?.title ?? appid;
      return steamConfirmation.issue({ appid, title, kind: "refresh", valid, retry: async options => {
        await waitForSteamSlot(gameRefresh, options.signal);
        await gameRefresh.refresh(directory, appid, options);
        return snapshot();
      } });
    }
  });
  ipcMain.handle("games:screenshots", (_event, appid) => {
    if (!dataDir || !sourceEntries(dataDir, "games", { reportCache }).entries.some(entry => String(entry.appid) === String(appid))) throw new Error("遊戲已不在目前清單中");
    gameScreenshots ??= new GameScreenshots(path.join(app.getPath("userData"), "steam-screenshots.json"));
    return gameScreenshots.resolve(appid);
  });
  ipcMain.handle("games:cancel-batch", () => gameBatch.cancel());
  ipcMain.handle("games:preview-batch", (_event, appids, action, reason) => {
    if (!dataDir || activeMedia !== "games") throw new Error("請先開啟遊戲頁並選擇資料夾");
    return gameBatch.prepare(dataDir, appids, action, reason);
  });
  ipcMain.handle("games:apply-batch", (_event, token) => {
    if (!dataDir || activeMedia !== "games") throw new Error("請先開啟遊戲頁");
    const result = gameBatch.apply(dataDir, token);
    if (result.action === "hide" && result.changedCount) lastOperation = { kind: "batch-hide", operation: result.operation };
    else if (result.action === "delete") lastOperation = null;
    const { operation, ...batchResult } = result;
    return { ...snapshot(), batchResult };
  });
  ipcMain.handle("anime:resolve-media", (_event, id, retry) => animeService().resolve(animeEntry(id), { retry: retry === true }));
  ipcMain.handle("anime:search-media", (_event, id, query) => { animeEntry(id); return animeService().search(query); });
  ipcMain.handle("anime:select-media", (_event, id, malId) => animeService().select(animeEntry(id), malId));
  ipcMain.handle("games:preview", async (event, input) => {
    trusted(event);
    if (!dataDir || activeMedia !== "games") throw new Error("請先開啟遊戲頁並選擇資料夾");
    steamConfirmation.cancel("preview");
    const epoch = ++manualEpoch;
    const dirEpoch = directoryEpoch;
    const directory = dataDir;
    const appid = parseSteamInput(input);
    const valid = () => manualEpoch === epoch && directoryEpoch === dirEpoch && dataDir === directory && activeMedia === "games";
    const retry = async ({ signal }) => {
      await waitForSteamSlot(manualGames, signal);
      const result = await manualGames.prepare(directory, appid);
      if (result.game?.verificationRequired) throw new Error("Steam 仍要求確認，尚未補齊社群標籤");
      return result;
    };
    const createVerification = title => steamConfirmation.issue({ appid, title, kind: "preview", valid, retry });
    try {
      const result = await manualGames.prepare(directory, appid);
      if (!valid()) throw new Error("遊戲預覽已取消");
      if (result.game?.verificationRequired) result.verification = createVerification(result.game.title);
      return result;
    } catch (error) {
      if (error.code !== "STEAM_VERIFICATION_REQUIRED" || !valid()) throw error;
      return { verification: createVerification(appid) };
    }
  });
  ipcMain.handle("games:cancel-preview", event => { trusted(event); ++manualEpoch; steamConfirmation.cancel("preview"); manualGames.cancel(); });
  ipcMain.handle("games:add", (event, token, destination) => {
    trusted(event);
    if (!dataDir || activeMedia !== "games") throw new Error("請先開啟遊戲頁");
    const appid = manualGames.commit(dataDir, token, destination);
    ++manualEpoch; steamConfirmation.cancel("preview");
    return { ...snapshot(), addedAppid: appid };
  });
  ipcMain.handle("library:load", (_event, media) => {
    gameBatch.cancel();
    if (media !== "games") { ++manualEpoch; steamConfirmation.cancel(); manualGames.cancel(); }
    if (["games", "anime", "movies", "liveAction"].includes(media)) activeMedia = media;
    return snapshot();
  });
  ipcMain.handle("library:set-game-note", (event, entryId, text) => {
    trusted(event);
    if (!dataDir) throw new Error("尚未選擇資料夾");
    setGameNote(dataDir, entryId, text);
    return snapshot();
  });
  ipcMain.handle("library:set-favorite", (_event, media, entryId, favorite, favoriteKind) => {
    if (!dataDir) throw new Error("尚未選擇資料夾");
    setFavorite(dataDir, media, entryId, favorite, favoriteKind);
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
    ++directoryEpoch; ++manualEpoch; steamConfirmation.cancel(); manualGames.cancel();
    gameBatch.cancel();
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
    const restored = lastOperation.kind === "batch-hide" ? gameBatch.undo(dataDir, lastOperation.operation) : lastOperation.kind === "reason" ? undoHiddenReason(dataDir, lastOperation.operation) : undoHide(dataDir, lastOperation.operation);
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
  ipcMain.handle("external:open-urls", (_event, urls) => openExternalUrls(urls, (url, options) => shell.openExternal(url, options)));
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
  mainWindow.on("closed", () => { ++directoryEpoch; ++manualEpoch; steamConfirmation.cancel(); manualGames.cancel(); });
  mainWindow.loadFile(path.join(sourceDir, "renderer", "index.html"));
}

app.whenReady().then(() => {
  coverRequestLog = new CoverRequestLog(path.join(app.getPath("userData"), "steam-cover-requests.log"));
  const coverFilter = { urls: ["https://*.steamstatic.com/*"] };
  session.defaultSession.webRequest.onSendHeaders(coverFilter, (details) => coverRequestLog.recordImageSent(details));
  session.defaultSession.webRequest.onCompleted(coverFilter, (details) => coverRequestLog.recordImage(details));
  session.defaultSession.webRequest.onErrorOccurred(coverFilter, (details) => coverRequestLog.recordImageError(details));
  dataDir = initialDirectory();
  registerIpc();
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("before-quit", () => { steamConfirmation.cancel(); coverRequestLog?.finish(); });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
