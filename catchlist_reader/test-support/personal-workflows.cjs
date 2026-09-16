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
const deadline = setTimeout(() => { console.error("互動測試逾時"); app.exit(1); }, 45000);

app.whenReady().then(async () => {
  const lib = await import(pathToFileURL(path.join(readerRoot, "src/library.js")).href);
  const { loadUpdateStatus } = await import(pathToFileURL(path.join(readerRoot, "src/update-status.js")).href);
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
  const snapshot = () => ({ dataDir: temp, appVersion: version, libraries: lib.loadAllLibraries(temp), hiddenEntries: lib.loadHiddenEntries(temp), updateStatus: loadUpdateStatus(temp) });
  ipcMain.handle("library:load", snapshot);
  ipcMain.handle("library:set-favorite", (_, media, id, favorite) => { lib.setFavorite(temp, media, id, favorite); return snapshot(); });
  ipcMain.handle("library:restore-hidden", (_, key) => { lib.restoreHiddenEntry(temp, key); return snapshot(); });
  ipcMain.handle("library:hide-entry", (_, media, id) => { operation = lib.hideEntry(temp, media, id); return snapshot(); });
  ipcMain.handle("library:undo-last-operation", () => { const restored = lib.undoHide(temp, operation); return { ...snapshot(), restored }; });
  ipcMain.handle("library:resolve-game-covers", () => ({}));
  ipcMain.handle("external:open-urls", () => { throw new Error("測試不得開啟外部連結"); });
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (_, callback) => callback({ cancel: true }));
  const win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { preload: path.join(readerRoot, "src/preload.cjs"), contextIsolation: true, sandbox: true } });
  const js = (code) => win.webContents.executeJavaScript(code);
  const until = async (condition) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await js(condition)) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`等待畫面逾時：${condition}`);
  };
  const click = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
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
  await win.loadFile(path.join(readerRoot, "src/renderer/index.html"));
  await until("document.querySelectorAll('.item.games').length === 7");
  assert.deepEqual(await js("[...document.querySelectorAll('.game-column-header > span')].map((item) => item.textContent)"), ["封面", "遊戲名稱", "好評率", "發售日", "中文", "社群標籤", "管理"]);
  assert.deepEqual(await js("[...document.querySelector('.item.games .game-facts').children].map((item) => item.classList[0])"), ["rating", "meta", "language-status"]);
  assert.deepEqual(await js("(() => { const button = document.querySelector('#backToTop'); return { hidden: button.getAttribute('aria-hidden'), tabIndex: button.tabIndex }; })()"), { hidden: "true", tabIndex: -1 });
  win.setContentSize(1440, 400);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await js("window.scrollTo(0, document.documentElement.scrollHeight)");
  await until("document.querySelector('#backToTop').getAttribute('aria-hidden') === 'false'");
  const floatingControl = await js(`(() => {
    const button = document.querySelector('#backToTop');
    const buttonRect = button.getBoundingClientRect();
    const toast = document.querySelector('#toast');
    toast.textContent = '測試提示';
    toast.classList.add('show');
    const toastRect = toast.getBoundingClientRect();
    const result = { width: Math.round(buttonRect.width), height: Math.round(buttonRect.height), rightGap: Math.round(document.documentElement.clientWidth - buttonRect.right), bottomGap: Math.round(innerHeight - buttonRect.bottom), separated: toastRect.bottom < buttonRect.top };
    toast.classList.remove('show');
    return result;
  })()`);
  assert.deepEqual(floatingControl, { width: 50, height: 50, rightGap: 22, bottomGap: 22, separated: true });
  await capture("back-to-top-desktop");
  await click("#backToTop");
  await until("window.scrollY < 2");
  await until("document.querySelector('#backToTop').getAttribute('aria-hidden') === 'true'");
  win.setContentSize(1440, 900);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.match(await js("document.querySelector('.update-panel summary').textContent"), /1 類更新失敗/);
  await click(".update-panel summary");
  assert.equal(await js("document.querySelectorAll('.update-row').length"), 4);
  assert.match(await js("document.querySelector('.update-details').textContent"), /新增 7 筆/);
  await click(".update-panel summary");

  const flows = [];
  for (const media of ["games", "anime", "movies", "liveAction"]) {
    await click(`[data-media="${media}"]`);
    await click('[data-view="all"]');
    await click("[data-favorite]");
    await until("document.querySelector('[data-favorite][aria-pressed=\"true\"]') !== null");
    await click('[data-view="favorites"]');
    assert.equal(await js("document.querySelectorAll('.item').length"), 1);
    if (media === "games") await capture("favorites-desktop");
    await click('[data-hide]');
    await until("document.querySelector('#confirmDialog').open");
    await click("#dialogConfirm");
    await until("document.querySelectorAll('.item').length === 0");
    await click('[data-view="hidden"]');
    await until("document.querySelectorAll('.hidden-row').length === 1");
    if (media === "games") await capture("hidden-desktop");
    await fill("[data-hidden-query]", "找不到的名稱");
    assert.equal(await js("document.querySelectorAll('.hidden-row').length"), 0);
    await fill("[data-hidden-query]", "");
    await click("[data-restore]");
    await until("document.querySelectorAll('.hidden-row').length === 0");
    await click('[data-view="favorites"]');
    assert.equal(await js("document.querySelectorAll('.item').length"), 1);
    flows.push(media);
  }
  // 重新載入整個畫面，收藏及舊隱藏紀錄均由磁碟讀取。
  const game = lib.loadLibrary(temp, "games").entries.find((entry) => entry.favorite);
  lib.hideEntry(temp, "games", game.id);
  await win.loadFile(path.join(readerRoot, "src/renderer/index.html"));
  await until("document.querySelector('[data-view=\"hidden\"]') !== null");
  await click('[data-view="hidden"]');
  assert.equal(await js("document.querySelectorAll('.hidden-row').length"), 1);
  await click("[data-restore]");
  await until("document.querySelectorAll('.hidden-row').length === 0");
  await click('[data-view="favorites"]');
  assert.equal(await js("document.querySelectorAll('.item').length"), 1);
  await click("[data-favorite]");
  await until("document.querySelectorAll('.item').length === 0");
  await click('[data-view="all"]');

  const screenshots = [];
  const sizes = [["desktop", 1440, 900], ["medium", 1000, 800], ["mobile", 390, 844]];
  for (const [name, width, height] of sizes) {
    win.setContentSize(width, height);
    await new Promise((resolve) => setTimeout(resolve, 150));
    for (const media of ["games", "anime", "movies", "liveAction"]) {
      await click(`[data-media="${media}"]`);
      const dimensions = await js("({ width: innerWidth, scroll: document.documentElement.scrollWidth })");
      assert.ok(dimensions.scroll <= dimensions.width, `${name}/${media} 水平溢出：${JSON.stringify(dimensions)}`);
    }
    await click('[data-media="games"]');
    if (name === "mobile") {
      await js("window.scrollTo(0, document.documentElement.scrollHeight)");
      await until("document.querySelector('#backToTop').getAttribute('aria-hidden') === 'false'");
      const mobileButton = await js("(() => { const rect = document.querySelector('#backToTop').getBoundingClientRect(); return { width: Math.round(rect.width), height: Math.round(rect.height), rightGap: Math.round(document.documentElement.clientWidth - rect.right), bottomGap: Math.round(innerHeight - rect.bottom) }; })()");
      assert.deepEqual(mobileButton, { width: 48, height: 48, rightGap: 14, bottomGap: 14 });
      screenshots.push(await capture("back-to-top-mobile"));
      await click("#backToTop");
      await until("window.scrollY < 2");
    }
    if (process.env.CATCHLIST_QA_DIR) screenshots.push(await capture(`personal-${name}`));
    await click(".update-panel summary");
    assert.ok(await js("document.documentElement.scrollWidth <= innerWidth"));
    if (process.env.CATCHLIST_QA_DIR) screenshots.push(await capture(`status-${name}`));
    await click(".update-panel summary");
  }
  for (const [filename, content] of Object.entries(fixtures)) assert.equal(fs.readFileSync(path.join(temp, filename), "utf8"), content);
  clearTimeout(deadline);
  console.log(JSON.stringify({ version, flows, restoredAfterReload: true, cancelFavorite: true, reportBytesUnchanged: true, responsiveWidths: sizes.map((size) => size[1]), screenshots }));
  win.destroy();
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
