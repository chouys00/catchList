const { app, BrowserWindow, session, desktopCapturer, dialog } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const probeRoot = process.argv.find(arg => arg.startsWith("--probe-root="))?.slice(13);
const temp = probeRoot || fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-steam-confirmation-"));
app.setPath("userData", path.join(temp, "profile"));
process.env.CATCHLIST_DATA_DIR = temp;
const deadline = setTimeout(() => { console.error("Steam 確認流程測試逾時"); app.exit(1); }, 90000);
const report = "2025  9月  (更新時間: 2026-03-01)\n\n- **測試遊戲** (Test)\n  2025-09-02 | 97% (12,345) | 動作\n  社群標籤: 策略\n  https://store.steampowered.com/app/123\n\n------------------------------\n";
const review = () => new Response(JSON.stringify({ response: { query_summary: { total_reviews: 374, total_positive: 337 } } }), { headers: { "content-type": "application/json" } });
app.whenReady().then(async () => {
  const steam = session.fromPartition("persist:catchlist-steam");
  // 只在隔離測試 profile 內模擬網站狀態；不使用 Steam 的生日或登入 Cookie。
  await steam.protocol.handle("https", async request => {
    const url = new URL(request.url);
    if (url.pathname.includes("appdetails")) {
      const id = url.searchParams.get("appids");
      return Response.json({ [id]: { success: true, data: { type: "game", name: "測試遊戲 " + id, release_date: { date: "2026 年 10 月 16 日" } } } });
    }
    const id = url.pathname.match(/\/(?:app|agecheck\/app)\/(\d+)/)?.[1];
    if (url.pathname.startsWith("/agecheck/")) {
      return new Response(`<!doctype html><html lang="zh-Hant"><meta charset="UTF-8"><body style="background:#171d25;color:#eee;font:18px sans-serif;padding:30px"><div class="agegate_box"><h1>測試用確認頁面</h1><p>此為隔離測試，不是 Steam 真實年齡驗證。</p><button id="complete" style="padding:15px" onclick="document.cookie='catchlist_test_confirmation=1; Path=/; Max-Age=3600; Secure; SameSite=Lax';location.href='/app/${id}/Test_Game/'">完成測試確認</button></div></body></html>`, { headers: { "content-type": "text/html;charset=utf-8" } });
    }
    if (!(await steam.cookies.get({ name: "catchlist_test_confirmation" })).length) {
      return new Response(null, { status: 302, headers: { location: `https://store.steampowered.com/agecheck/app/${id}/` } });
    }
    return new Response('<!doctype html><meta charset="UTF-8"><h1>測試遊戲商店頁</h1><a class="app_tag">探索</a><a class="app_tag">冒險</a>', { headers: { "content-type": "text/html;charset=utf-8" } });
  });
  const nativeFetch = global.fetch;
  global.fetch = (url, options) => String(url).includes("GetAppReviews") ? Promise.resolve(review()) : nativeFetch(url, options);
  const { SteamAccess } = await import(pathToFileURL(path.join(root, "src/steam-access.js")));
  // net.request 不走自訂 protocol handler；測試傳輸使用 Chromium session.fetch，
  // 把模擬網站的最終轉址還原成手動轉址回應。產品傳輸另以真實連線驗證。
  SteamAccess.prototype.fetchStore = async function (url, options) {
    const response = await this.session.fetch(url, { ...options, redirect: "follow", credentials: "include" });
    return response.redirected ? new Response(null, { status: 302, headers: { location: response.url } }) : response;
  };
  if (probeRoot) {
    const service = new SteamAccess({ getParent: () => null });
    assert.equal((await service.status()).hasWebsiteData, true);
    await session.defaultSession.cookies.set({ url: "https://example.com", name: "unrelated", value: "keep" });
    await service.clear();
    assert.equal((await service.status()).hasWebsiteData, false);
    assert.equal((await session.defaultSession.cookies.get({ name: "unrelated" })).length, 1);
    console.log(JSON.stringify({ persisted: true, isolatedClear: true }));
    clearTimeout(deadline); app.exit(0); return;
  }
  fs.writeFileSync(path.join(temp, "遊戲.md"), report);
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["https://*.steamstatic.com/*"] }, (_details, callback) => callback({ cancel: true }));
  await import(pathToFileURL(path.join(root, "src/main.js")));
  const until = async check => {
    for (let n = 0; n < 200; n++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 40)); }
    throw new Error("等待畫面逾時");
  };
  let main;
  await until(() => { main = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes("index.html")); return main; });
  main.webContents.setBackgroundThrottling(false);
  const js = code => main.webContents.executeJavaScript(code);
  await until(() => js('!!document.querySelector("[data-refresh-game]")'));
  const capture = async (win, name) => {
    if (!process.env.CATCHLIST_QA_DIR) return;
    win.showInactive(); await new Promise(resolve => setTimeout(resolve, 150));
    fs.mkdirSync(process.env.CATCHLIST_QA_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.CATCHLIST_QA_DIR, name + ".png"), (await win.webContents.capturePage()).toPNG());
    if (win.contentView.children[0]?.webContents) {
      const [width, height] = win.getSize();
      const sources = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width, height } });
      const source = sources.find(source => source.id === win.getMediaSourceId() || source.name === win.getTitle());
      if (source && !source.thumbnail.isEmpty()) fs.writeFileSync(path.join(process.env.CATCHLIST_QA_DIR, name + "-native.png"), source.thumbnail.toPNG());
      else fs.writeFileSync(path.join(process.env.CATCHLIST_QA_DIR, name + "-capture-note.txt"), "此環境未提供確認子視窗的原生擷取來源；已驗證本機工具列與遠端 DOM 操作，未宣稱遠端網頁的完整截圖通過。");
    }
  };
  const openPrompt = async () => {
    await js('document.querySelector("[data-refresh-game]").click()');
    await until(() => js('!!document.querySelector(".steam-verification-dialog[open]")'));
  };
  await openPrompt();
  for (const width of [1440, 390]) {
    main.setSize(width, 900); await new Promise(resolve => setTimeout(resolve, 100));
    const bounds = await js(`(() => { const panel=document.querySelector('.steam-verification-dialog');const buttons=[...panel.querySelectorAll('button')];return { overflow:document.documentElement.scrollWidth>innerWidth, fits:buttons.every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=44}), busy:document.querySelector('[data-refresh-game]').getAttribute('aria-busy') };})()`);
    assert.equal(bounds.overflow, false); assert.equal(bounds.fits, true); assert.equal(bounds.busy, "false");
    await capture(main, `steam-prompt-${width}`);
  }
  await js('document.querySelector(".steam-verification-dialog [value=cancel]").click()');
  await until(() => js('document.querySelector("#toast").textContent.includes("已取消更新")'));
  assert.equal(fs.existsSync(path.join(temp, ".catchlist-game-refresh.json")), false);
  await new Promise(resolve => setTimeout(resolve, 1500));
  await openPrompt();
  await js('document.querySelector(".steam-verification-dialog [value=confirm]").click()');
  let auth;
  await until(() => { auth = BrowserWindow.getAllWindows().find(win => win !== main); return auth; });
  let remote;
  await until(() => { remote = auth.contentView.children[0]?.webContents; return remote?.getURL().includes("agecheck"); });
  await until(() => remote.executeJavaScript('!!document.querySelector("#complete")'));
  assert.equal(await remote.executeJavaScript('typeof window.catchList + "," + typeof require + "," + typeof window.steamConfirmation'), "undefined,undefined,undefined");
  for (const width of [960, 390]) {
    auth.setSize(width, 760); await new Promise(resolve => setTimeout(resolve, 100));
    const shape = await auth.webContents.executeJavaScript(`(() => { const buttons=[...document.querySelectorAll('button')];return {overflow:document.documentElement.scrollWidth>innerWidth,fits:buttons.every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=44}),header:document.querySelector('header').getBoundingClientRect().bottom, message:document.querySelector('#steamMessage').getBoundingClientRect().bottom};})()`);
    assert.equal(shape.overflow, false); assert.equal(shape.fits, true); assert.ok(shape.message <= shape.header);
    await capture(auth, `steam-window-${width}`);
  }
  await remote.executeJavaScript("location.href='https://evil.test/'");
  await until(() => auth.webContents.executeJavaScript('document.querySelector("#steamMessage").textContent.includes("已停止")'));
  assert.ok(remote.getURL().startsWith("https://store.steampowered.com/"));
  await remote.executeJavaScript('document.querySelector("#complete").click()');
  await until(() => js('document.querySelector("#toast").textContent.includes("已更新遊戲")'));
  assert.equal(auth.isDestroyed(), true);
  const saved = JSON.parse(fs.readFileSync(path.join(temp, ".catchlist-game-refresh.json"), "utf8"));
  assert.ok(JSON.stringify(saved).includes("374"));
  assert.equal(fs.readFileSync(path.join(temp, "遊戲.md"), "utf8"), report);
  // 新增入口使用同一份狀態，正常預覽不需要再次確認。
  await js('document.querySelector("[data-action=add-game]").click()');
  await until(() => js('!!document.querySelector("#manualGameDialog[open]")'));
  await js('document.querySelector("#steamGameInput").value="456";document.querySelector("#manualGameLookup").requestSubmit()');
  await until(() => js('document.querySelector(".manual-preview").textContent.includes("374")'));
  assert.equal(await js('document.querySelector(".steam-inline-confirmation").hidden'), true);
  // 失效後提供內嵌入口，取消仍保留預覽；完成確認只更新預覽，不自動加入。
  for (const cookie of await steam.cookies.get({})) await steam.cookies.remove("https://store.steampowered.com", cookie.name);
  await new Promise(resolve => setTimeout(resolve, 1500));
  await js('document.querySelector("#manualGameLookup").requestSubmit()');
  await until(() => js('!document.querySelector(".steam-inline-confirmation").hidden'));
  assert.equal(await js(`(() => { const b=document.querySelector('[data-steam-confirm]').getBoundingClientRect();const body=document.querySelector('.manual-panel-body').getBoundingClientRect();return b.top>=body.top&&b.bottom<=body.bottom;})()`), true);
  await capture(main, "steam-manual-required-390");
  await js('document.querySelector("[data-steam-confirm]").click()');
  await until(() => { auth = BrowserWindow.getAllWindows().find(win => win !== main); return auth; });
  auth.close();
  await until(() => js('document.querySelector(".manual-status").textContent.includes("已取消 Steam")'));
  assert.equal(await js('document.querySelector("[data-panel-save]").disabled'), false);
  // 取消的編號不能重播；重新讀取才能取得新的請求。
  await new Promise(resolve => setTimeout(resolve, 1500));
  await js('document.querySelector("#manualGameLookup").requestSubmit()');
  await until(() => js('!document.querySelector(".steam-inline-confirmation").hidden && !document.querySelector("form button").disabled'));
  await js('document.querySelector("[data-steam-confirm]").click()');
  await until(() => { auth = BrowserWindow.getAllWindows().find(win => win !== main); return auth; });
  await until(() => { remote = auth.contentView.children[0]?.webContents; return remote?.getURL().includes("agecheck"); });
  await until(() => remote.executeJavaScript('!!document.querySelector("#complete")'));
  await remote.executeJavaScript('document.querySelector("#complete").click()');
  await until(() => js('document.querySelector(".steam-inline-confirmation").hidden && !document.querySelector("[data-panel-save]").disabled'));
  assert.equal(fs.existsSync(path.join(temp, ".catchlist-manual-games.json")), false);
  await js('document.querySelector("[data-steam-status]").click()');
  await until(() => js('document.querySelector(".steam-website-message").textContent.includes("已保存")'));
  await capture(main, "steam-manual-completed-390");
  const originalDialog = dialog.showMessageBox;
  dialog.showMessageBox = async (_window, options) => { assert.equal(options.cancelId, 0); return { response: 0 }; };
  await js('document.querySelector("[data-steam-clear]").click()');
  await until(() => js('!document.querySelector("[data-steam-clear]").disabled'));
  assert.ok((await steam.cookies.get({ name: "catchlist_test_confirmation" })).length);
  await session.defaultSession.cookies.set({ url: "https://example.com", name: "unrelated", value: "keep" });
  dialog.showMessageBox = async () => ({ response: 1 });
  await js('document.querySelector("[data-steam-clear]").click()');
  await until(() => js('document.querySelector(".steam-website-message").textContent.includes("沒有保存")'));
  assert.equal((await steam.cookies.get({})).length, 0);
  assert.equal((await session.defaultSession.cookies.get({ name: "unrelated" })).length, 1);
  dialog.showMessageBox = originalDialog;
  // 下個程序只驗證測試 Cookie 的保存，與真實年齡確認無關。
  await steam.cookies.set({ url: "https://store.steampowered.com", name: "catchlist_test_confirmation", value: "1", expirationDate: Date.now() / 1000 + 3600 });
  await steam.cookies.flushStore();
  console.log(JSON.stringify({ success: true, temp, realMain: true, remoteIsolated: true, reportUnchanged: true }));
  clearTimeout(deadline); app.exit(0);
}).catch(error => { console.error(error); clearTimeout(deadline); app.exit(1); });
