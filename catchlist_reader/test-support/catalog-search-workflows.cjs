// 在隔離資料夾驗證正式 preload、資料層與 Chromium 畫面，不存取雲端或開啟外部連結。
const { app, BrowserWindow, ipcMain, session } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const readerRoot = path.resolve(process.env.CATCHLIST_TEST_READER_ROOT || path.join(__dirname, ".."));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-personal-ui-"));
app.setPath("userData", path.join(temp, "profile"));
const deadline = setTimeout(() => { console.error("互動測試逾時"); app.exit(1); }, 90000);

app.whenReady().then(async () => {
  const lib = await import(pathToFileURL(path.join(readerRoot, "src/library.js")).href);
  const { ReportCache } = await import(pathToFileURL(path.join(readerRoot, "src/report-cache.js")).href);
  const reportCache = new ReportCache(lib.parseReport);
  const { loadUpdateStatus } = await import(pathToFileURL(path.join(readerRoot, "src/update-status.js")).href);
  const { VisitHistory } = await import(pathToFileURL(path.join(readerRoot, "src/visit-history.js")).href);
  let visits = new VisitHistory();
  let activeMedia = "games";
  const fixtures = {
    "遊戲.md": fs.readFileSync(path.join(__dirname, "../test-data/steam-tags-2026-02/遊戲.md"), "utf8"),
    "動畫.md": "2026  春  >7.70\n\n- 星海郵差  **8.20**  (12 · TV)\n------------------------------\n",
    "電影.md": "2026  3月  >7.00\n\n- 遠方來信  **8.15**  `(IMDb: 8.3 | 一般外國片 (-0.15) | 144k票)`\n------------------------------\n",
    "真人劇年度.md": "2025  全年度\n\n## 韓劇\n- [年度測試劇](https://www.imdb.com/title/tt1234567/)：8.2／10（7,526 票）\n------------------------------\n",
  };
  for (const [filename, content] of Object.entries(fixtures)) fs.writeFileSync(path.join(temp, filename), content);
  const timestamp = new Date().toISOString();
  fs.writeFileSync(path.join(temp, ".catchlist-update-status.json"), JSON.stringify({ version: 1, media: {
    games: { status: "success", startedAt: timestamp, finishedAt: timestamp, lastSuccessAt: timestamp, addedCount: 7 },
    movies: { status: "failed", startedAt: timestamp, finishedAt: timestamp, addedCount: 0, error: "測試網路失敗" },
  } }));
  const version = JSON.parse(fs.readFileSync(path.join(readerRoot, "package.json"))).version;
  let operation;
  const snapshot = () => ({ dataDir: temp, appVersion: version, ...visits.annotate(temp, lib.loadAllLibraries(temp, reportCache), activeMedia), hiddenEntries: lib.loadHiddenEntries(temp, reportCache), updateStatus: loadUpdateStatus(temp) });
  ipcMain.handle("library:load", (_, media) => { activeMedia = media ?? activeMedia; return snapshot(); });
  ipcMain.handle("library:set-favorite", (_, media, id, favorite) => { lib.setFavorite(temp, media, id, favorite); return snapshot(); });
  ipcMain.handle("library:set-hidden-reason", (_, key, reason) => { operation = lib.setHiddenReason(temp, key, reason); return snapshot(); });
  ipcMain.handle("library:favorite-backlog", (_, id) => { lib.favoriteBacklogEntry(temp, id); return snapshot(); });
  ipcMain.handle("library:restore-hidden", (_, key) => { lib.restoreHiddenEntry(temp, key); return snapshot(); });
  ipcMain.handle("library:hide-entry", (_, media, id, reason) => { operation = lib.hideEntry(temp, media, id, reason); return snapshot(); });
  ipcMain.handle("library:undo-last-operation", () => { const restored = operation.changedReason ? lib.undoHiddenReason(temp, operation) : lib.undoHide(temp, operation); return { ...snapshot(), restored }; });
  const coverFixture = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215"><rect width="460" height="215" fill="#243329"/><text x="230" y="120" text-anchor="middle" fill="#c8f169" font-size="30">Game cover</text></svg>');
  ipcMain.handle("library:resolve-game-covers", (_, appids) => Object.fromEntries(appids.map(appid => [appid, coverFixture])));
  ipcMain.handle("external:open-urls", () => { throw new Error("測試不得開啟外部連結"); });
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (_, callback) => callback({ cancel: true }));
  const win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { preload: path.join(readerRoot, "src/preload.cjs"), contextIsolation: true, sandbox: true } });
  const js = async (code) => { try { return await win.webContents.executeJavaScript(code); } catch (error) { throw new Error(`${error.message}\n程式：${code}`); } };
  const until = async (condition) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await js(condition)) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`等待畫面逾時：${condition}`);
  };
  const click = async (selector) => {
    await js(`document.querySelector(${JSON.stringify(selector)}).click()`);
    // 分類切換與讀取走正式非同步橋接。
    if (selector.includes("data-media") || selector.includes('data-action="reload"')) await new Promise((resolve) => setTimeout(resolve, 100));
  };
  const fill = (selector, value) => js(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const capture = async (name) => {
    if (!process.env.CATCHLIST_QA_DIR) return null;
    await js("document.querySelector('#toast').classList.remove('show'); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await new Promise((resolve) => setTimeout(resolve, 100));
    fs.mkdirSync(process.env.CATCHLIST_QA_DIR, { recursive: true });
    const filepath = path.join(process.env.CATCHLIST_QA_DIR, `${name}.png`);
    fs.writeFileSync(filepath, (await win.webContents.capturePage()).toPNG());
    return filepath;
  };

  const games = lib.loadAllLibraries(temp).find(l => l.media === "games").entries;
  lib.setFavorite(temp, "games", games[0].id, true);
  for (const [index, reason] of [[1,"backlog"],[2,"played"],[3,"not_interested"]]) lib.hideEntry(temp,"games",games[index].id,reason);
  lib.setFavorite(temp, "games", games[2].id, true);
  await win.loadFile(path.join(readerRoot, "src/renderer/index.html"));
  await until("document.querySelectorAll('.item.games').length === 3");
  await capture("catalog-off-desktop");
  const search='[data-filter="query"]';
  const toggle='[data-action="toggle-catalog"]';
  await fill(search, 'original-filter');
  await js("document.querySelector('[data-filter=minReviews]').value='50000'; document.querySelector('[data-filter=minReviews]').dispatchEvent(new Event('change',{bubbles:true}))");
  await click(toggle);
  assert.equal(await js("document.querySelector('.catalog-switch').getAttribute('aria-checked')"),'true');
  assert.equal(await js("document.querySelector('[data-action=toggle-filters]').disabled"),true);
  for (const game of games) {
    await fill(search,game.appid);
    assert.equal(await js("document.querySelectorAll('.item.games').length"),1);
    assert.equal(await js("document.querySelector('.item.games').dataset.gameRow"),game.appid);
    await fill(search,game.originalTitle || game.title);
    assert.ok(await js("document.querySelectorAll('.item.games').length >= 1"));
  }
  await fill(search,games[2].appid);
  assert.match(await js("document.querySelector('.catalog-classification').textContent"), /待玩收藏.*玩過了/);
  await capture('catalog-on-desktop');
  // 候補轉收藏必須走正式轉移流程，不能只切換書籤。
  await fill(search,games[1].appid);
  await click('[data-favorite]');
  await until("document.querySelector('.catalog-classification')?.textContent.includes('待玩收藏') && !document.querySelector('.catalog-classification')?.textContent.includes('候補')");
  assert.equal(await js("document.querySelectorAll('.item.games').length"),1);
  await click('[data-hide]'); await click('[data-reason=played]');
  await until("document.querySelector('.catalog-classification')?.textContent.includes('玩過了')");
  await click('[data-hide]'); await click('[data-reason=backlog]');
  await until("document.querySelector('.catalog-classification')?.textContent.includes('候補')");
  await click('[data-hide]'); await click('[data-reason=restore]');
  await until("!document.querySelector('.catalog-classification')?.textContent.includes('候補')");
  await click('[data-favorite]');
  await until("document.querySelector('.catalog-classification')?.textContent.includes('尚未分類')");
  await click('[data-action=clear-search]');
  assert.equal(await js("document.querySelectorAll('.item.games').length"),0);
  assert.match(await js("document.querySelector('.empty').textContent"),/輸入遊戲名稱/);
  await fill(search,'no-such-game');
  assert.match(await js("document.querySelector('.empty').textContent"),/全部收錄中沒有符合/);
  await click(toggle);
  assert.equal(await js("document.querySelector('[data-filter=query]').value"),'original-filter');
  assert.equal(await js("document.querySelector('[data-filter=minReviews]').value"),'50000');
  await click(toggle);
  await fill(search,games[0].appid);
  for (const width of [1440,1000,390]) {
    win.setContentSize(width,850);
    await new Promise(resolve=>setTimeout(resolve,180));
    assert.ok(await js("document.documentElement.scrollWidth <= innerWidth"), '寬度 '+width+' 不應水平溢出');
    assert.ok(await js("(() => { const r=document.querySelector('.catalog-switch').getBoundingClientRect(); return r.x>=0 && r.right<=innerWidth && r.height>=38; })()"));
    await capture('catalog-on-'+width);
  }
  await click('[data-view=favorites]');
  assert.equal(await js("document.querySelector('.catalog-switch').getAttribute('aria-checked')"),'false');
  await click('[data-view=hidden]');
  await click(toggle); await fill(search,games[2].appid);
  assert.equal(await js("document.querySelectorAll('.item.games').length"),1);
  await click(toggle);
  assert.ok(await js("Boolean(document.querySelector('.hidden-list'))"));
  for (const [filename, content] of Object.entries(fixtures)) assert.equal(fs.readFileSync(path.join(temp, filename), "utf8"), content);
  clearTimeout(deadline);
  console.log(JSON.stringify({ catalogSearch:true, reportBytesUnchanged:true }));
  win.destroy(); app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
