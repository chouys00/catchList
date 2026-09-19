// 真實 Chromium 與隔離報告副本：模式篩選、組合篩選及響應式截圖。
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = process.argv[3];
const output = path.resolve(process.argv[4] || 'output/playwright/player-mode');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'catchlist-mode-'));
app.setPath('userData', path.join(directory, 'profile'));
app.whenReady().then(async () => {
  const lib = await import(pathToFileURL(path.join(root, 'src/library.js')).href);
  for (const name of ['遊戲.md', '.catchlist-game-features.json']) fs.copyFileSync(path.join(source, name), path.join(directory, name));
  const original = fs.readFileSync(path.join(directory, '遊戲.md'));
  const getGames = () => lib.loadLibrary(directory, 'games').entries;
  const totals = Object.fromEntries(['single', 'multi', 'unknown'].map(mode => [mode, getGames().filter(game => game.playerMode === mode).length]));
  assert.equal(getGames().find(game => game.appid === '1052990')?.playerMode, 'single');
  ipcMain.handle('library:load', () => ({ dataDir: directory, libraries: lib.loadAllLibraries(directory), appVersion: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version }));
  // 封面取自已保存商店頁的實際 og:image，不猜測圖片路徑。
  ipcMain.handle('library:resolve-game-covers', (_, ids) => Object.fromEntries(ids.flatMap(id => {
    const filename = path.resolve('steam_discovery/.local-backups/passed-3111-raw-20260910', `${id}.json`);
    if (!fs.existsSync(filename)) return [];
    const html = JSON.parse(fs.readFileSync(filename)).html;
    const url = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1];
    return url && /^https:\/\//.test(url) ? [[id, url]] : [];
  })));
  const win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { preload: path.join(root, 'src/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level === 3 && !message.includes('ERR_')) errors.push(message); });
  const js = code => win.webContents.executeJavaScript(code);
  const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const until = async code => { for (let n = 0; n < 100; n++) { if (await js(code)) return; await new Promise(r => setTimeout(r, 50)); } throw new Error(code); };
  await win.loadFile(path.join(root, 'src/renderer/index.html'));
  await until('!!document.querySelector(".item.games")');
  await click('[data-action="toggle-filters"]');
  for (const mode of ['single', 'multi', 'unknown']) {
    await click(`[data-player-mode="${mode}"]`);
    assert.equal(await js(`document.querySelector('[data-result-count]').textContent`), `${totals[mode]} 筆結果`);
    assert.equal(await js(`[...document.querySelectorAll('.player-mode')].every(el => el.dataset.mode === '${mode}')`), true);
    assert.match(await js(`document.querySelector('[data-action="toggle-filters"]').textContent`), /1/);
  }
  await click('[data-player-mode="multi"]');
  await js(`const chinese = document.querySelector('[data-filter="chinese"]'); chinese.value = 'supported'; chinese.dispatchEvent(new Event('change', { bubbles: true }));`);
  const expected = getGames().filter(game => game.playerMode === 'multi' && game.chineseSupport === 'supported').length;
  assert.equal(await js(`document.querySelector('[data-result-count]').textContent`), `${expected} 筆結果`);
  await click('[data-action="toggle-filters"]');
  await click('[data-action="toggle-filters"]');
  assert.equal(await js(`document.querySelector('[data-player-mode="multi"]').getAttribute('aria-pressed')`), 'true');
  await click('[data-action="clear-filters"]');
  assert.equal(await js(`document.querySelector('[data-result-count]').textContent`), `${getGames().length} 筆結果`);
  assert.equal(await js(`document.querySelector('[data-player-mode="all"]').getAttribute('aria-pressed')`), 'true');
  fs.mkdirSync(output, { recursive: true });
  await new Promise(r => setTimeout(r, 1500));
  const layout = [];
  for (const width of [1440, 1100, 1024, 900, 760, 390]) {
    win.setContentSize(width, 950);
    await new Promise(r => setTimeout(r, 250));
    const metrics = await js(`(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, modeHeight: document.querySelector('[data-player-mode="single"]').getBoundingClientRect().height, columns: getComputedStyle(document.querySelector('.game-filter-fields')).gridTemplateColumns.split(/\\s+/).length }))()`);
    assert.ok(metrics.scrollWidth <= metrics.clientWidth, JSON.stringify(metrics));
    if (width === 390) assert.ok(metrics.modeHeight >= 44);
    layout.push(metrics);
    if ([1440, 1024, 390].includes(width)) fs.writeFileSync(path.join(output, `filters-${width}.png`), (await win.webContents.capturePage()).toPNG());
  }
  await click('[data-player-mode="multi"]');
  await click('[data-action="toggle-filters"]');
  await new Promise(r => setTimeout(r, 250));
  fs.writeFileSync(path.join(output, 'multiplayer-mobile.png'), (await win.webContents.capturePage()).toPNG());
  win.setContentSize(1440, 950);
  await new Promise(r => setTimeout(r, 200));
  fs.writeFileSync(path.join(output, 'multiplayer-desktop.png'), (await win.webContents.capturePage()).toPNG());
  await js('window.scrollTo(0, 550)');
  await new Promise(r => setTimeout(r, 400));
  assert.ok(await js('document.querySelector(".game-column-header").getBoundingClientRect().bottom < 0'));
  fs.writeFileSync(path.join(output, 'multiplayer-scrolled.png'), (await win.webContents.capturePage()).toPNG());
  assert.deepEqual(fs.readFileSync(path.join(directory, '遊戲.md')), original);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ totals, combination: expected, layout, output, reportsUnchanged: true }));
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
