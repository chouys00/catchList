const electron = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { app, BrowserWindow } = electron;
const rendererRoot = path.resolve(__dirname, "../src/renderer");

function contentType(filepath) {
  if (filepath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filepath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filepath.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function startServer() {
  const server = http.createServer((request, response) => {
    const pathname = request.url === "/" ? "/index.html" : new URL(request.url, "http://localhost").pathname;
    const filepath = path.resolve(rendererRoot, `.${pathname}`);
    if (!filepath.startsWith(`${rendererRoot}${path.sep}`) || !fs.existsSync(filepath)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": contentType(filepath) });
    fs.createReadStream(filepath).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function searchState(window) {
  return window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[data-filter="query"]');
    return {
      value: input?.value ?? null,
      focused: document.activeElement === input,
      selectionStart: input?.selectionStart ?? null,
      selectionEnd: input?.selectionEnd ?? null,
      resultCount: document.querySelector('.section-status span')?.textContent ?? null,
    };
  })()`);
}

async function focusSearch(window) {
  await window.webContents.executeJavaScript(`document.querySelector('[data-filter="query"]').focus()`);
}

async function press(window, keyCode, modifiers = []) {
  window.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  await new Promise((resolve) => setTimeout(resolve, 20));
}

async function run() {
  const server = await startServer();
  const address = server.address();
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  try {
    await window.loadURL(`http://127.0.0.1:${address.port}`);
    await window.webContents.executeJavaScript(`new Promise((resolve) => {
      const done = () => document.querySelector('[data-filter="query"]') ? resolve() : setTimeout(done, 10);
      done();
    })`);

    await focusSearch(window);
    await window.webContents.insertText("abcdef");
    const typed = await searchState(window);

    await press(window, "Backspace");
    await press(window, "Backspace");
    const backspaced = await searchState(window);

    await window.webContents.executeJavaScript(`document.querySelector('[data-filter="query"]').setSelectionRange(2, 2)`);
    await window.webContents.insertText("X");
    const insertedInMiddle = await searchState(window);

    await window.webContents.executeJavaScript(`document.querySelector('[data-filter="query"]').setSelectionRange(1, 4)`);
    await window.webContents.insertText("Z");
    const replacedSelection = await searchState(window);

    await press(window, "A", ["control"]);
    await window.webContents.insertText("極光旅人");
    const chinese = await searchState(window);

    await window.webContents.executeJavaScript(`document.querySelector('[data-media="anime"]').click()`);
    const animeBeforeSearch = await searchState(window);
    await focusSearch(window);
    await window.webContents.insertText("星海");
    const animeAfterSearch = await searchState(window);
    await window.webContents.executeJavaScript(`document.querySelector('[data-media="games"]').click()`);
    const restoredGameSearch = await searchState(window);

    await window.webContents.executeJavaScript(`document.querySelector('[data-action="clear-filters"]').click()`);
    const cleared = await searchState(window);

    process.stdout.write(`${JSON.stringify({ typed, backspaced, insertedInMiddle, replacedSelection, chinese, animeBeforeSearch, animeAfterSearch, restoredGameSearch, cleared })}\n`);
  } finally {
    window.destroy();
    await new Promise((resolve) => server.close(resolve));
    app.quit();
  }
}

app.whenReady().then(run).catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  app.exit(1);
});
