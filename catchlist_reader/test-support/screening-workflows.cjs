const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../src/renderer");
const output = path.resolve(__dirname, "../output/screening");
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.setPath("userData", path.join(output, "test-user"));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const file = path.resolve(root, `.${url.pathname === "/" ? "/index.html" : url.pathname}`);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html");
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const window = new BrowserWindow({ width: 1440, height: 1000, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true } });
  const errors = [];
  window.webContents.on("console-message", (_event, level, message) => { if (level === 3 && !message.includes("ERR_")) errors.push(message); });
  const run = code => window.webContents.executeJavaScript(code);
  const click = async action => { await run(`document.querySelector('[data-screen="${action}"]').click()`); await delay(80); };
  const title = () => run(`document.querySelector('.screening-info h3')?.textContent`);
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}`);
    await delay(150);
    await run(`localStorage.clear(); window.catchList.resolveGameScreenshots = async () => { throw new Error('測試暫時失敗'); }; document.querySelector('[data-action="screen-games"]').click()`);
    await delay(100);
    assert.match(await run(`document.querySelector('.screening-images').textContent`), /測試暫時失敗/);
    const initial = await title();
    // Local fixture isolates layout and interaction tests from Steam availability.
    await run(`window.catchList.resolveGameScreenshots = async () => [1,2,3].map(i => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#233c46"/><path d="M0 430L240 180L460 430L720 130L960 430V540H0Z" fill="#405f68"/><circle cx="720" cy="110" r="45" fill="#c8f169"/><text x="40" y="490" fill="#f0eadf" font-size="28">Gameplay screenshot fixture '+i+'</text></svg>')); void 0;`);
    if (process.env.CATCHLIST_SCREENING_REAL) {
      const { pathToFileURL } = require("node:url");
      const { GameScreenshots } = await import(pathToFileURL(path.resolve(__dirname, "../src/game-screenshots.js")).href);
      const service = new GameScreenshots(path.join(output, "real-screenshots.json"));
      const urls = await service.resolve("3300800");
      await run(`window.catchList.resolveGameScreenshots = async () => ${JSON.stringify(urls)}; void 0;`);
    }
    await click("retry");
    assert.equal(await run(`document.querySelectorAll('.screening-shot').length`), 3);
    await run(`Promise.all([...document.querySelectorAll('.screening-shot img')].map(img => img.decode().catch(() => {})))`);
    await delay(150);
    const lint = async name => {
      const result = await run(`(() => {
        const dialog = document.querySelector('.screening-dialog');
        const visible = [...dialog.querySelectorAll('*')].filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().height);
        return { dialogOverflow: dialog.scrollWidth > dialog.clientWidth + 1, actionsVisible: [...dialog.querySelectorAll('.screening-decisions button')].every(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), missingAlt: dialog.querySelectorAll('img:not([alt])').length, tinyText: visible.filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.className), focusInside: dialog.contains(document.activeElement) };
      })()`);
      assert.equal(result.dialogOverflow, false);
      assert.equal(result.actionsVisible, true);
      assert.equal(result.missingAlt, 0);
      assert.deepEqual(result.tinyText, []);
      assert.equal(result.focusInside, true);
      fs.writeFileSync(path.join(output, `${process.env.CATCHLIST_SCREENING_REAL ? "real-" : ""}${name}.png`), (await window.webContents.capturePage()).toPNG());
      return result;
    };
    // 同一輪事件立即關閉並重開，延後到達的 close 不得使新截圖失效。
    await run(`document.querySelector('[data-screen="close"]').click(); document.querySelector('[data-action="screen-games"]').click()`);
    await delay(200);
    assert.equal(await run(`document.querySelectorAll('.screening-shot').length`), 3);
    const desktop = await lint("desktop");
    window.setContentSize(390, 844);
    await delay(400);
    const mobile = await lint("mobile");
    await click("next");
    const second = await title();
    assert.notEqual(second, initial);
    await click("close");
    await run(`document.querySelector('[data-action="screen-games"]').click()`);
    await delay(100);
    assert.equal(await title(), second);
    // Reload the document: current game and seen records must survive.
    await window.reload();
    await delay(300);
    await run(`window.catchList.resolveGameScreenshots = async () => []; document.querySelector('[data-action="screen-games"]').click()`);
    await delay(100);
    assert.equal(await title(), second);
    await click("hide");
    assert.equal(await run(`document.querySelectorAll('[data-view="not_interested"] .view-count').length >= 0 && document.querySelector('.screening-dialog').open`), true);
    await click("undo");
    assert.equal(await title(), second);
    await click("favorite");
    assert.notEqual(await title(), second);
    await click("undo");
    assert.equal(await title(), second);
    await run(`document.querySelector('.screening-dialog').dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }))`);
    await delay(100);
    assert.notEqual(await title(), second);
    assert.equal(await run(`window.catchList.load('games').then(payload => payload.libraries.find(l => l.media === 'games').entries.find(e => e.title === ${JSON.stringify(second)}).favoriteKind)`), 'shared');
    await click("undo");
    assert.equal(await title(), second);
    assert.equal(await run(`window.catchList.load('games').then(payload => payload.libraries.find(l => l.media === 'games').entries.find(e => e.title === ${JSON.stringify(second)}).favorite)`), false);
    // Repeated keys must not apply decisions; one normal shortcut does.
    await run(`document.querySelector('.screening-dialog').dispatchEvent(new KeyboardEvent('keydown', { key: '1', repeat: true, bubbles: true }))`);
    assert.equal(await title(), second);
    await run(`document.querySelector('.screening-dialog').dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }))`);
    await delay(80);
    assert.notEqual(await title(), second);
    for (let i = 0; i < 10; i++) {
      if (!await title()) break;
      await click("next");
    }
    assert.match(await run(`document.querySelector('.screening-empty').textContent`), /已經看完/);
    await click("undo");
    assert.ok(await title());
    assert.deepEqual(errors, []);
    process.stdout.write(JSON.stringify({ desktop, mobile, persistence: true, hideUndo: true, favoriteUndo: true, shortcuts: true, completion: true, errors }) + "\n");
  } finally { window.destroy(); server.close(); app.quit(); }
}).catch(error => { console.error(error.stack); app.exit(1); });
