const { app, BrowserWindow, ipcMain, session } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-keyboard-"));
app.setPath("userData", path.join(temp, "profile"));
const timeout = setTimeout(() => { console.error("鍵盤驗收逾時"); app.exit(1); }, 90000);
app.whenReady().then(async () => {
  const games = Array.from({ length: 1000 }, (_, index) => ({
    id: `game-${index}`, appid: String(6000000 + index), media: "games",
    title: `測試遊戲 ${String(index).padStart(4, "0")}`, originalTitle: `Game ${index}`,
    score: 95, reviews: 1000, releaseDate: "2026-01-01", year: 2026, month: 1,
    tags: ["策略"], genres: [], chineseSupport: "supported", playerMode: "single", url: "https://example.test/",
  }));
  const libraries = [{ media: "games", exists: true, sections: [], entries: games }, ...["anime", "movies", "liveAction"].map(media => ({
    media, exists: true, sections: [], entries: Array.from({ length: 60 }, (_, index) => ({
      media, id: `${media}-${index}`, title: `作品 ${index}`, year: 2026, month: 1, season: "冬", periodLabel: "2026", region: "韓劇",
      score: 8.2, imdbScore: 8.3, votesLabel: "30k票", category: "一般外國片", url: "https://example.test/", searchUrl: "https://example.test/",
    })),
  }))];
  const payload = () => ({ dataDir: temp, appVersion: "1.0.69", hiddenEntries: [], libraries });
  const coverRequests = [];
  ipcMain.handle("library:load", () => payload());
  ipcMain.handle("library:resolve-game-covers", (_, ids) => { coverRequests.push(...ids); return Object.fromEntries(ids.map(id => [id, "https://example.test/cover.svg"])); });
  ipcMain.handle("anime:resolve-media", () => ({ status: "ready" }));
  ipcMain.handle("games:screenshots", () => ({ screenshots: [] }));
  session.defaultSession.protocol.handle("https", () => new Response('<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215"><rect width="460" height="215" fill="#283127"/></svg>', { headers: { "Content-Type": "image/svg+xml" } }));
  const win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { preload: path.join(root, "src/preload.cjs"), sandbox: true, contextIsolation: true, offscreen: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on("render-process-gone", (_, detail) => errors.push(detail.reason));
  const js = code => win.webContents.executeJavaScript(code);
  const pause = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));
  const until = async code => { for (let n = 0; n < 300; n++) { if (await js(code)) return; await pause(); } throw Error(`等待失敗：${code}`); };
  const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const key = async code => {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: code });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: code });
    await pause();
  };
  const reset = () => js("document.activeElement?.blur(); window.scrollTo({top:0,behavior:'instant'})");
  const y = () => js("scrollY");
  const bottom = "Math.abs(document.documentElement.scrollHeight - innerHeight - scrollY) <= 2";
  await win.loadFile(path.join(root, "src/renderer/index.html"));
  await until("document.querySelectorAll('[data-game-row]').length === 50");
  await reset();
  await key("Down"); assert.equal(await y(), 80);
  await key("Up"); assert.equal(await y(), 0);
  for (let n = 0; n < 3; n++) {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Down", isAutoRepeat: n > 0 });
    await pause(10);
  }
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Down" });
  assert.equal(await y(), 240);
  await key("Home"); assert.equal(await y(), 0);

  // End 只使用目前結果，完成後才跳到底部；封面不整批查詢。
  await key("End"); await key("End");
  await until("document.querySelectorAll('[data-game-row]').length === 1000 && " + bottom);
  await pause(120);
  assert.ok(new Set(coverRequests).size < 100, `End 不得查詢所有封面：${new Set(coverRequests).size}`);
  const beforeLazy = new Set(coverRequests).size;
  await js("document.querySelectorAll('[data-game-row]')[500].scrollIntoView({behavior:'instant'})");
  await until(`document.querySelectorAll('.game-cover-loading').length < ${1000 - beforeLazy}`);
  await key("Home"); assert.equal(await y(), 0);

  const reloadGames = async () => {
    await click('[data-media="movies"]');
    await until("document.querySelector('[data-media=movies].active')");
    await click('[data-view="all"]');
    await click('[data-action="clear-filters"]');
    await until("document.querySelector('.item.movies')");
    await reset();
    // 重設遊戲閱讀位置與列表批數，以篩選操作建立新的首批。
    await click('[data-media="games"]');
    await until("document.querySelector('[data-media=games].active')");
    await click('[data-view="all"]');
    await click('[data-action="clear-filters"]');
    await until("document.querySelectorAll('[data-game-row]').length === 50");
    await reset();
  };
  const startEnd = () => js("document.activeElement?.blur(); window.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}))");
  for (const cancel of ["Home", "ArrowDown", "wheel", "pointerdown"]) {
    await reloadGames();
    await js(`document.activeElement?.blur(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true})); document.dispatchEvent(${["Home", "ArrowDown"].includes(cancel) ? `new KeyboardEvent('keydown',{key:'${cancel}',bubbles:true,cancelable:true})` : `new Event('${cancel}',{bubbles:true})`});`);
    await pause(120);
    assert.equal(await js("document.querySelectorAll('[data-game-row]').length"), 50, cancel);
    assert.ok(await y() <= 80);
  }
  // 中途可處理點擊，且切換排序、篩選、分類後不會跳到舊結果底部。
  for (const action of ["sort", "filter", "view", "media"]) {
    await reloadGames();
    await startEnd();
    await until("document.querySelectorAll('[data-game-row]').length > 50");
    if (action === "sort") await click('[data-game-sort="reviews"]');
    if (action === "filter") await js("const q=document.querySelector('[data-filter=query]'); q.value='沒有結果'; q.dispatchEvent(new Event('input',{bubbles:true}))");
    if (action === "view") await click('[data-view="favorites"]');
    if (action === "media") await click('[data-media="movies"]');
    await pause(250);
    assert.ok(await y() < 500, `${action} 不得跳回舊清單底部`);
    if (["filter", "view"].includes(action)) assert.equal(await js("document.querySelectorAll('[data-game-row]').length"), 0);
  }
  await reloadGames();
  // 輸入框、備註、下拉與選單保留自身按鍵；合成事件可直接檢查是否被攔截。
  const ignored = async (selector, extra = "") => {
    await js(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); el.focus(); ${extra} })()`);
    for (const name of ["ArrowUp", "ArrowDown", "Home", "End"]) {
      assert.equal(await js(`(() => { const event=new KeyboardEvent('keydown',{key:'${name}',bubbles:true,cancelable:true}); document.activeElement.dispatchEvent(event); return event.defaultPrevented; })()`), false, selector + name);
    }
  };
  await ignored('[data-filter="query"]');
  await js("window.scrollTo({top:0,behavior:'instant'})");
  const inputY = await y(); await key("End"); assert.ok(Math.abs(await y() - inputY) <= 3);
  await click('[data-action="toggle-filters"]');
  await ignored('select[data-filter="chinese"]');
  await click('[data-action="toggle-filters"]');
  await reset();
  await click('[data-game-note]');
  await ignored('#gameNoteText');
  await pause(200);
  const modalY = await y();
  await key("End"); assert.equal(await y(), modalY);
  await js("document.querySelector('[data-note-cancel]').focus()");
  await key("End");
  await pause(200);
  assert.equal(await y(), modalY, "視窗按鈕上的 End 不得捲動背景");
  await click('[data-note-cancel]');
  await until("!document.querySelector('.game-note-dialog')");
  await click('[data-hide]');
  await js("window.__beforeMenuY=scrollY");
  await key("End");
  assert.equal(await js("document.activeElement === document.querySelector('[role=menu] button:last-child')"), true);
  assert.equal(await js("scrollY === window.__beforeMenuY"), true);
  await key("Escape");
  await click('[data-action="screen-games"]');
  await until("document.querySelector('.screening-dialog[open]')");
  const screeningY = await y(); await key("End"); assert.equal(await y(), screeningY);
  await key("Escape");
  await until("!document.querySelector('.screening-dialog[open]')");

  await reset();
  for (const modifier of ["ctrlKey", "altKey", "shiftKey", "metaKey"]) {
    assert.equal(await js(`(() => { const event=new KeyboardEvent('keydown',{key:'End',${modifier}:true,bubbles:true,cancelable:true}); document.body.dispatchEvent(event); return event.defaultPrevented; })()`), false);
  }
  assert.equal(await js("(() => { const event=new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}); event.preventDefault(); document.body.dispatchEvent(event); return scrollY; })()"), 0);
  await js("document.querySelector('[data-filter=query]').insertAdjacentHTML('afterend','<div id=editable contenteditable=true>可編輯</div>')");
  await ignored('#editable');
  await js("document.querySelector('#editable').remove()");
  const flows = [];
  for (const media of ["anime", "movies", "liveAction"]) {
    await click(`[data-media="${media}"]`);
    await until(`document.querySelector('.item.${media === "liveAction" ? "live-action" : media}')`);
    await reset();
    await key("Down"); assert.equal(await y(), 80);
    await key("Up"); assert.equal(await y(), 0);
    await key("End"); await until(bottom);
    await key("Home"); assert.equal(await y(), 0);
    flows.push(media);
  }
  // 空清單與不足一頁，End 不會觸發載入或錯誤。
  libraries[3].entries = libraries[3].entries.slice(0, 1);
  await click('[data-media="movies"]'); await click('[data-media="liveAction"]');
  await reset(); await key("End"); assert.equal(await y(), 0);
  libraries[3].entries = [];
  await click('[data-media="movies"]'); await click('[data-media="liveAction"]');
  await reset(); await key("End"); await key("Home"); assert.equal(await y(), 0);
  assert.deepEqual(errors, []);
  clearTimeout(timeout);
  console.log(JSON.stringify({ count: 1000, flows: ["games", ...flows], lazyCoverRequests: new Set(coverRequests).size, cancellation: true, controlsProtected: true, errors }));
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
