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
  await win.loadFile(path.join(readerRoot, "src/renderer/index.html"));
  await until("document.querySelectorAll('.item.games').length === 7");
  assert.equal(await js("document.querySelector('#advancedFilters').hidden"), true);
  assert.ok(await js("document.querySelector('.list').getBoundingClientRect().top < 240"), "桌面首筆結果應位於 240px 內，包含新增的工具列留白");
  await capture("compact-desktop");
  const select = (key, value) => js(`(() => { const el = document.querySelector('[data-filter="${key}"]'); el.value = '${value}'; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await select("sort", "score");
  assert.equal(await js("document.querySelector('.item .rating strong').textContent"), "99%");
  await select("sort", "reviews");
  assert.equal(await js("document.querySelector('.item .rating small').textContent"), "(2,721)");
  await select("sort", "date");
  await click('[data-action="toggle-new"]');
  assert.equal(await js("document.querySelectorAll('.item').length"), 0);
  await click('[data-action="toggle-new"]');
  // 上次已看過六筆，最後一筆模擬本次新加入；既有 Markdown 全程保持不變。
  const historyPath = path.join(temp, ".catchlist-visits.json");
  const visitFixture = JSON.parse(fs.readFileSync(historyPath, "utf8"));
  visitFixture.media.games.keys.pop();
  fs.writeFileSync(historyPath, JSON.stringify(visitFixture));
  visits = new VisitHistory();
  await click('[data-media="anime"]'); await click('[data-media="games"]');
  await until("document.querySelector('.new-filter span').textContent === '1'");
  await click('[data-action="toggle-new"]');
  assert.equal(await js("document.querySelectorAll('.item').length"), 1);
  await click('[data-media="anime"]'); await click('[data-media="games"]');
  assert.equal(await js("document.querySelectorAll('.item').length"), 1);
  await click('[data-media="anime"]');
  await click('[data-media="games"]');
  assert.equal(await js("document.querySelectorAll('.item').length"), 1);
  await capture("new-arrivals-desktop");
  await click('[data-action="toggle-new"]');
  await click('[data-action="toggle-filters"]');
  await select("min", "97");
  assert.equal(await js("document.querySelectorAll('.item').length"), 4);
  await click('[data-action="toggle-filters"]');
  assert.match(await js("document.querySelector('[data-action=\"toggle-filters\"]').textContent"), /1/);
  assert.equal(await js("document.querySelectorAll('.item').length"), 4);
  await click('[data-action="toggle-filters"]');
  await click('[data-action="toggle-tags"]');
  await capture("filters-desktop");
  await click('[data-action="clear-filters"]');
  await click('[data-action="toggle-filters"]');
  assert.deepEqual(await js("[...document.querySelectorAll('.game-column-header > span')].map((item) => item.textContent)"), ["封面", "遊戲名稱", "好評率", "發售日", "中文", "模式", "社群標籤", "管理"]);
  assert.deepEqual(await js("[...document.querySelector('.item.games .game-facts').children].map((item) => item.classList[0])"), ["rating", "meta", "language-status", "language-status"]);
  assert.deepEqual(await js("(() => { const button = document.querySelector('#backToTop'); return { hidden: button.getAttribute('aria-hidden'), tabIndex: button.tabIndex }; })()"), { hidden: "true", tabIndex: -1 });
  win.setContentSize(1440, 280);
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
  const listTopBeforeDetails = await js("document.querySelector('.list').getBoundingClientRect().top");
  await click(".update-panel summary");
  assert.equal(await js("document.querySelectorAll('.update-row').length"), 4);
  assert.match(await js("document.querySelector('.update-details').textContent"), /新增 7 筆/);
  assert.equal(await js("document.querySelector('.list').getBoundingClientRect().top"), listTopBeforeDetails, "更新詳情不可推擠列表");
  await js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  assert.equal(await js("document.querySelector('.update-panel').open"), false);

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
    if (media === "games") await click('[data-reason="played"]');
    else { await until("document.querySelector('#confirmDialog').open"); await click("#dialogConfirm"); }
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
  visits = new VisitHistory();
  await win.loadFile(path.join(readerRoot, "src/renderer/index.html"));
  await until("document.querySelector('[data-view=\"hidden\"]') !== null");
  assert.equal(await js("document.querySelector('.new-filter span').textContent"), "0");
  await click('[data-view="hidden"]');
  assert.equal(await js("document.querySelectorAll('.hidden-row').length"), 1);
  await click("[data-restore]");
  await until("document.querySelectorAll('.hidden-row').length === 0");
  await click('[data-view="favorites"]');
  assert.equal(await js("document.querySelectorAll('.item').length"), 1);
  await click("[data-favorite]");
  await until("document.querySelectorAll('.item').length === 0");
  await click('[data-view="all"]');

  // 真正的 Chromium 鍵盤事件，檢查桌面與窄視窗原因選單、候補與復原。
  for (const [label, width] of [["desktop", 1440], ["narrow", 390]]) {
    win.setContentSize(width, 900);
    await new Promise(resolve => setTimeout(resolve, 100));
    await click('[data-hide]');
    assert.equal(await js("document.activeElement.dataset.reason"), "not_interested");
    const key = async keyCode => { win.focus(); await js("document.activeElement?.focus()"); win.webContents.sendInputEvent({ type: "keyDown", keyCode }); win.webContents.sendInputEvent({ type: "keyUp", keyCode }); await new Promise(resolve => setTimeout(resolve, 60)); };
    await key("Escape");
    assert.equal(await js("document.activeElement.hasAttribute('data-hide')"), true);
    await key("Space");
    await until("document.querySelector('.hide-menu') !== null");
    await key("Down");
    assert.equal(await js("document.activeElement.dataset.reason"), "backlog");
    await capture(`classification-menu-${label}`);
    assert.ok(await js("(() => { const r = document.querySelector('.hide-menu').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()"));
    await key("Space");
    await until("document.querySelector('[data-action=undo]') !== null");
    await click('[data-action="undo"]');
    await until("document.querySelectorAll('.item.games').length === 7");
    await click('[data-hide]'); await click('[data-reason="backlog"]');
    await until("document.querySelector('[data-action=undo]') !== null");
    await click('[data-view="backlog"]');
    assert.equal(await js("document.querySelectorAll('.item.games').length"), 1);
    await fill('[data-filter="query"]', '不會找到');
    assert.equal(await js("document.querySelectorAll('.item.games').length"), 0);
    await fill('[data-filter="query"]', '');
    await capture(`classification-backlog-${label}`);
    await click('[data-hide]'); await click('[data-reason="restore"]');
    await until("document.querySelectorAll('.item.games').length === 0");
    await click('[data-view="all"]');
    await click('[data-hide]'); await click('[data-reason="backlog"]');
    await until("document.querySelector('[data-action=undo]') !== null");
    await click('[data-view="backlog"]'); await click('[data-favorite]');
    await until("document.querySelectorAll('.item.games').length === 0");
    await click('[data-view="favorites"]');
    assert.equal(await js("document.querySelectorAll('.item.games').length"), 1);
    await click('[data-favorite]'); await until("document.querySelectorAll('.item.games').length === 0");
    await click('[data-view="all"]'); await click('[data-hide]'); await click('[data-reason="not_interested"]');
    await until("document.querySelector('[data-action=undo]') !== null");
    await click('[data-view="hidden"]');
    await js("(() => { const el = document.querySelector('[data-reason-filter]'); el.value = 'all'; el.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await js("(() => { const el = document.querySelector('[data-hidden-reason]'); el.value = 'played'; el.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await until("document.querySelector('[data-hidden-reason]').value === 'played' && document.querySelector('#toast').textContent.includes('已修改')");
    await js("(() => { const el = document.querySelector('[data-reason-filter]'); el.value = 'backlog'; el.dispatchEvent(new Event('change', { bubbles: true })); })()");
    assert.equal(await js("document.querySelectorAll('.hidden-row').length"), 0);
    await js("(() => { const el = document.querySelector('[data-reason-filter]'); el.value = 'played'; el.dispatchEvent(new Event('change', { bubbles: true })); })()");
    assert.equal(await js("document.querySelectorAll('.hidden-row').length"), 1);
    await capture(`classification-hidden-${label}`);
    await click('[data-restore]'); await until("document.querySelectorAll('.hidden-row').length === 0");
    await click('[data-view="all"]'); await click('[data-action="toggle-filters"]');
    await select('min', '90'); await select('max', '95');
    assert.ok(await js("[...document.querySelectorAll('.rating strong')].every(el => parseInt(el.textContent) >= 90 && parseInt(el.textContent) < 95)"));
    await capture(`classification-range-${label}`);
    await select('min', '95');
    assert.match(await js("document.querySelector('[data-rating-error]').textContent"), /上限必須大於/);
    assert.equal(await js("document.querySelectorAll('.item.games').length"), 7);
    await click('[data-action="clear-filters"]');
    assert.equal(await js("document.querySelector('[data-filter=max]').value"), '');
    assert.equal(await js("document.querySelector('[data-rating-error]').textContent"), '');
    await click('[data-action="toggle-filters"]');
    assert.ok(await js("document.documentElement.scrollWidth <= innerWidth"));
  }
  for (const [label, width] of [["desktop", 1440], ["narrow", 390]]) {
    win.setContentSize(width, 900);
    await new Promise(resolve => setTimeout(resolve, 100));
    for (const reason of ["played", "not_interested"]) {
      await click('[data-view="all"]');
      await click('[data-hide]'); await click(`[data-reason="${reason}"]`);
      await until("document.querySelectorAll('.item.games').length === 6");
      await click(`[data-view="${reason}"]`);
      assert.equal(await js("document.querySelectorAll('.item.games').length"), 1);
      assert.ok(await js("!!document.querySelector('.item .game-cover') && !!document.querySelector('.item .title-primary') && !!document.querySelector('.item .rating') && !!document.querySelector('.item .game-date') && !!document.querySelector('.item .game-tags')"));
      await until("document.querySelector('.item .game-cover img')?.naturalWidth > 0");
      assert.equal(await js("document.querySelectorAll('.item .game-management button').length"), 3);
      await fill('[data-filter="query"]', '不會找到');
      assert.equal(await js("document.querySelectorAll('.item.games').length"), 0);
      await fill('[data-filter="query"]', '');
      await select('sort', 'score');
      await click('[data-action="toggle-filters"]');
      await select('min', '97'); await select('max', '97');
      assert.match(await js("document.querySelector('[data-rating-error]').textContent"), /上限必須大於/);
      await click('[data-action="clear-filters"]'); await click('[data-action="toggle-filters"]');
      await click('[data-favorite]');
      await until("document.querySelector('[data-favorite]').getAttribute('aria-pressed') === 'true'");
      assert.equal(await js("document.querySelectorAll('.item.games').length"), 1, '收藏切換保留原分類');
      await capture(`${reason}-${label}`);
      assert.ok(await js("document.documentElement.scrollWidth <= innerWidth"));
      await click('[data-hide]'); await click('[data-reason="restore"]');
      await until("document.querySelectorAll('.item.games').length === 0");
      await click('[data-view="favorites"]');
      assert.equal(await js("document.querySelectorAll('.item.games').length"), 1);
      await click('[data-favorite]'); await until("document.querySelectorAll('.item.games').length === 0");
      await click(`[data-view="${reason}"]`); await click('[data-media="anime"]');
      assert.equal(await js("document.querySelector('[data-view=all]').getAttribute('aria-pressed')"), 'true');
      await click('[data-media="games"]');
    }
  }
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
    if (name === "mobile") {
      await click('[data-action="toggle-filters"]');
      assert.ok(await js("document.documentElement.scrollWidth <= innerWidth"));
      await capture("filters-mobile");
      await click('[data-action="toggle-filters"]');
    }
    await click(".update-panel summary");
    assert.ok(await js("document.documentElement.scrollWidth <= innerWidth"));
    if (process.env.CATCHLIST_QA_DIR) screenshots.push(await capture(`status-${name}`));
    await click(".update-panel summary");
  }
  await click('[data-action="toggle-new"]');
  fs.writeFileSync(historyPath, "broken");
  await click('[data-media="anime"]'); await click('[data-media="games"]');
  await until("document.querySelector('.new-filter').disabled");
  assert.equal(await js("document.querySelectorAll('.item.games').length"), 7);
  assert.equal(await js("document.querySelector('.new-filter').getAttribute('aria-pressed')"), "false");
  assert.match(await js("document.querySelector('[role=alert]').textContent"), /新收錄紀錄/);
  assert.equal(fs.readFileSync(historyPath, "utf8"), "broken");
  for (const [filename, content] of Object.entries(fixtures)) assert.equal(fs.readFileSync(path.join(temp, filename), "utf8"), content);
  clearTimeout(deadline);
  console.log(JSON.stringify({ version, flows, restoredAfterReload: true, cancelFavorite: true, reportBytesUnchanged: true, responsiveWidths: sizes.map((size) => size[1]), screenshots }));
  win.destroy();
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
