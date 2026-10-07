// 使用正式 renderer 與 preload；五萬筆隔離資料不讀寫正式報告。
const { app, BrowserWindow, ipcMain, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-game-sort-"));
app.setPath("userData", path.join(temp, "profile"));
const deadline = setTimeout(() => { console.error("排序互動測試逾時"); app.exit(1); }, 90000);

app.whenReady().then(async () => {
  session.defaultSession.protocol.handle("https", () => new Response('<svg xmlns="http://www.w3.org/2000/svg" width="280" height="130"><rect width="280" height="130" fill="#283127"/><text x="20" y="76" fill="#c8f169" font-size="28">CatchList Test</text></svg>', { headers: { "Content-Type": "image/svg+xml" } }));
  const { filterAndSortGames } = await import(pathToFileURL(path.join(root, "src/renderer/game-browser.js")));
  const games = Array.from({ length: 50000 }, (_, i) => ({
    media: "games", id: `game-${i}`, appid: String(6000000 + i),
    title: `測試遊戲 ${String(i).padStart(5, "0")}`, originalTitle: `Game ${i}`,
    releaseDate: i % 137 === 0 ? null : `${2020 + i % 7}-${String(1 + i % 12).padStart(2, "0")}-${String(1 + i % 28).padStart(2, "0")}`,
    score: i % 137 === 0 ? null : (i % 201) / 2,
    reviews: i * 7, chineseSupport: "supported", playerMode: "single",
    tags: ["策略", "單人"], genres: [], url: "https://example.test/game",
  }));
  const payload = { dataDir: temp, appVersion: "test", hiddenEntries: [], libraries: [
    { media: "games", exists: true, entries: games, sections: [] },
    ...["anime", "movies", "liveAction"].map(media => ({ media, exists: true, entries: [], sections: [] })),
  ] };
  const coverRequests = [];
  ipcMain.handle("library:load", () => payload);
  ipcMain.handle("library:resolve-game-covers", (_, ids) => { coverRequests.push(...ids); return Object.fromEntries(ids.map(id => [id, "https://shared.akamai.steamstatic.com/catchlist-test.svg"])); });
  const win = new BrowserWindow({ show: false, width: 1440, height: 950, webPreferences: { preload: path.join(root, "src/preload.cjs"), sandbox: true, contextIsolation: true, offscreen: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on("render-process-gone", (_, detail) => errors.push(detail.reason));
  win.webContents.on("console-message", details => { if (details.level === "error") errors.push(details.message); });
  const js = code => win.webContents.executeJavaScript(code);
  const pause = () => new Promise(resolve => setTimeout(resolve, 200));
  const until = async code => { for (let n = 0; n < 100; n++) { if (await js(code)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw Error(code); };
  const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = async (key, value) => {
    await js(`(() => { const el = document.querySelector('[data-filter="${key}"]'); el.focus(); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await pause();
  };
  const chooseSort = value => js(`(() => { const el = document.querySelector('[data-filter="sort"]'); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const rowIds = () => js(`[...document.querySelectorAll('[data-game-row]')].map(el => el.dataset.gameRow)`);
  const expectedIds = filters => filterAndSortGames(games, filters).slice(0, 50).map(e => e.appid);
  await win.loadFile(path.join(root, "src/renderer/index.html"));
  await until("document.querySelectorAll('[data-game-row]').length === 50");
  assert.deepEqual(await rowIds(), expectedIds({ sort: "date" }));
  const performanceResults = [];
  for (const [sort, direction] of [["score", "desc"], ["score", "asc"], ["date", "desc"], ["date", "asc"]]) {
    const elapsed = await js(`new Promise(resolve => { const start = performance.now(); document.querySelector('[data-game-sort="${sort}"]').click(); const queryAndDOMMs = performance.now() - start; requestAnimationFrame(() => requestAnimationFrame(() => resolve({ queryAndDOMMs, nextFrameMs: performance.now() - start }))); })`);
    performanceResults.push({ sort, direction, queryAndDOMMs: Number(elapsed.queryAndDOMMs.toFixed(1)), nextFrameMs: Number(elapsed.nextFrameMs.toFixed(1)) });
    assert.deepEqual(await rowIds(), expectedIds({ sort, sortDirection: direction }));
    assert.equal(await js("document.querySelector('[data-filter=sort]').value"), `${sort}:${direction}`);
    assert.equal(await js(`document.querySelector('[data-game-sort="${sort}"] .sort-arrow').textContent`), direction === "asc" ? "↑" : "↓");
    assert.equal(await js("document.activeElement.dataset.gameSort"), sort);
  }
  // 以真正鍵盤事件驗證原生表頭按鈕的 Enter 行為。
  win.focus();
  await js("document.activeElement.focus()");
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
  win.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
  await until("document.querySelector('[data-filter=sort]').value === 'date:desc'");
  await until("document.querySelectorAll('[data-game-row] img').length === 50 && [...document.querySelectorAll('[data-game-row] img')].every(img => img.naturalWidth > 0)");
  const initialCoverRequests = coverRequests.length;
  for (let i = 0; i < 9; i++) await click('[data-action="load-more-games"]');
  await until("document.querySelectorAll('[data-game-row] img').length === 500");
  await js("window.scrollTo({top:2000, behavior:'instant'})");
  await chooseSort("score:asc");
  assert.equal(await js("document.querySelectorAll('[data-game-row]').length"), 50);
  assert.deepEqual(await rowIds(), expectedIds({ sort: "score", sortDirection: "asc" }));
  assert.ok(await js("document.querySelector('.list').getBoundingClientRect().top >= -1"));
  await chooseSort("date:desc");
  await until("document.querySelectorAll('[data-game-row] img').length === 50");
  assert.equal(new Set(coverRequests).size, coverRequests.length, "重排沿用已查詢封面");
  assert.ok(coverRequests.length > initialCoverRequests);
  await click('[data-action="toggle-filters"]');
  assert.equal(await js("document.querySelector('[data-filter=year], [data-filter=month]')"), null);
  // 快速選取仍經由正式 input 更新篩選值；浮層不改變欄位位置。
  await fill("max", "90");
  const fieldTop = await js("document.querySelector('[data-filter=minReviews]').getBoundingClientRect().top + scrollY");
  await click('.rating-input:has([data-filter=max]) .rating-dropdown');
  assert.equal(await js("document.querySelector('[data-filter=max]').getAttribute('aria-expanded')"), "true");
  assert.equal(await js("document.querySelector('[data-filter=minReviews]').getBoundingClientRect().top + scrollY"), fieldTop);
  assert.equal(await js("document.querySelector('#rating-option-max-90').getAttribute('aria-selected')"), "true");
  const sendKey = async key => {
    win.focus();
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
    if (key === 'Return') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
    await pause();
  };
  await sendKey('Down'); await sendKey('Return');
  assert.equal(await js("document.querySelector('[data-filter=max]').value"), "95");
  assert.equal(await js("document.activeElement.dataset.filter"), "max");
  // 用真正滑鼠事件檢查選項不會因輸入框失焦而消失。
  await click('.rating-input:has([data-filter=max]) .rating-dropdown');
  const optionPoint = await js("(() => { const r = document.querySelector('#rating-option-max-97').getBoundingClientRect(); return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)}; })()");
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...optionPoint });
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...optionPoint });
  await pause();
  assert.equal(await js("document.querySelector('[data-filter=max]').value"), "97");
  await fill("max", "94.5");
  const wheel = (deltaY, shiftKey = false) => js(`(() => { const input = document.querySelector('[data-filter=max]'); const event = new WheelEvent('wheel', { deltaY: ${deltaY}, shiftKey: ${shiftKey}, bubbles: true, cancelable: true }); input.dispatchEvent(event); return { value: input.value, prevented: event.defaultPrevented }; })()`);
  assert.deepEqual(await wheel(-100), { value: "95.5", prevented: true });
  assert.deepEqual(await wheel(100, true), { value: "95.4", prevented: true });
  await fill("max", "90");
  for (let i = 0; i < 4; i++) assert.equal((await wheel(-20)).value, "90");
  assert.equal((await wheel(-20)).value, "91");
  await fill("max", "100"); assert.equal((await wheel(-100)).value, "100");
  await fill("max", "0"); assert.equal((await wheel(100)).value, "0");
  for (const value of ["", "101", "-1"]) {
    await fill("max", value);
    assert.deepEqual(await wheel(-100), { value, prevented: false });
  }
  await fill("max", "90");
  await js("document.querySelector('[data-filter=query]').focus()");
  assert.deepEqual(await wheel(-100), { value: "90", prevented: false });
  await click('.rating-input:has([data-filter=max]) .rating-dropdown');
  await sendKey('Escape');
  assert.equal(await js("document.querySelector('#rating-options-max').hidden"), true);
  await click('.rating-input:has([data-filter=max]) .rating-dropdown');
  await sendKey('Tab');
  assert.equal(await js("document.querySelector('#rating-options-max').hidden"), true);
  await click('.rating-input:has([data-filter=max]) .rating-dropdown');
  await js("document.querySelector('[data-filter=query]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
  assert.equal(await js("document.querySelector('#rating-options-max').hidden"), true);
  for (const [min, max] of [["", ""], ["90", ""], ["", "95"], ["90", "95"], ["95", "95"], ["0", "0"], ["99.5", "100"], ["-1", ""], ["", "101"], ["96", "95"]]) {
    await fill("min", min); await fill("max", max);
    const expected = filterAndSortGames(games, { min, max }).length;
    assert.equal(await js("document.querySelector('[data-result-count]').textContent"), `${expected} 筆結果`);
    assert.equal(await js("document.activeElement.dataset.filter"), "max");
  }
  assert.match(await js("document.querySelector('[data-rating-error]').textContent"), /上限須大於或等於/);
  await click('[data-action="clear-filters"]');
  assert.equal(await js("document.querySelector('[data-filter=min]').value"), "");
  assert.equal(await js("document.querySelector('[data-filter=max]').value"), "");
  await fill("min", "90"); await fill("max", "95");
  const output = path.resolve(root, "../output/reader-rating-presets");
  fs.mkdirSync(output, { recursive: true });
  const layout = [];
  for (const width of [1440, 1100, 1024, 900, 760, 390]) {
    win.setContentSize(width, 950); await pause();
    await js("window.scrollTo(0,0)"); await pause();
    const metrics = await js(`(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, inputHeight: document.querySelector('[data-filter=max]').getBoundingClientRect().height, headerVisible: getComputedStyle(document.querySelector('.game-column-header')).display !== 'none' }))()`);
    const bounds = await js(`['max', 'min', 'minReviews'].map(key => { const r = document.querySelector('[data-filter='+key+']').getBoundingClientRect(); return {top:r.top, height:r.height}; })`);
    assert.equal(bounds[0].height, bounds[1].height);
    assert.equal(bounds[0].top, bounds[1].top);
    if (width >= 1024) { assert.ok(Math.abs(bounds[0].top - bounds[2].top) <= 1); assert.equal(bounds[0].height, bounds[2].height); }
    assert.ok(metrics.scrollWidth <= metrics.clientWidth, JSON.stringify(metrics));
    if (width === 390) { assert.ok(metrics.inputHeight >= 44); assert.equal(metrics.headerVisible, false); }
    layout.push(metrics);
    if ([1440, 1024, 390].includes(width)) {
      fs.writeFileSync(path.join(output, `game-filters-${width}.png`), (await win.webContents.capturePage()).toPNG());
      await click('.rating-input:has([data-filter=max]) .rating-dropdown'); await pause();
      const popupBounds = await js("(() => { const r = document.querySelector('#rating-options-max').getBoundingClientRect(); return {left:r.left, right:r.right, top:r.top, bottom:r.bottom}; })()");
      assert.ok(popupBounds.left >= 0 && popupBounds.right <= width && popupBounds.top >= 0 && popupBounds.bottom <= 950);
      fs.writeFileSync(path.join(output, `game-presets-${width}.png`), (await win.webContents.capturePage()).toPNG());
      await sendKey('Escape');
    }
  }
  await chooseSort("score:asc");
  assert.deepEqual(await rowIds(), expectedIds({ min: "90", max: "95", sort: "score", sortDirection: "asc" }));
  assert.ok(await js("document.querySelector('.list').getBoundingClientRect().top >= -1"), "窄版表頭隱藏時仍回到列表起點");
  await click('[data-action="clear-filters"]');
  assert.equal(await js("document.querySelector('[data-filter=sort]').value"), "score:asc");
  await fill("query", "測試遊戲 000");
  await click('[data-action="toggle-catalog"]');
  await fill("query", "測試遊戲 000");
  assert.deepEqual(await rowIds(), expectedIds({ query: "測試遊戲 000", sort: "score", sortDirection: "asc" }));
  assert.deepEqual(errors, []);
  const result = { count: games.length, performanceResults, layout, coversReused: true, catalogDirection: true, errors };
  fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  clearTimeout(deadline); win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
