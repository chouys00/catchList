const { app, BrowserWindow, ipcMain, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const root = path.resolve(process.env.CATCHLIST_TEST_READER_ROOT || path.join(__dirname, ".."));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-anime-ui-"));
app.setPath("userData", path.join(temp, "profile"));
const timer = setTimeout(() => { console.error("動畫互動測試逾時"); app.exit(1); }, 60000);
app.whenReady().then(async () => {
  const { AnimeMediaService } = await import(require("node:url").pathToFileURL(path.join(root, "src/anime-media.js")).href);
  assert.equal(typeof AnimeMediaService, "function");
  if (!process.env.CATCHLIST_ANIME_LIVE_COVERS) session.defaultSession.protocol.handle("https", () => new Response('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="340"><rect width="240" height="340" fill="#31534b"/><circle cx="120" cy="140" r="64" fill="#b3cda3"/><path d="M30 320 110 160 220 320Z" fill="#192e33"/></svg>', { headers: { "Content-Type": "image/svg+xml" } }));
  const entries = [
    { id: "hyouka", title: "冰菓", year: 2012, periodLabel: "2012 年春季", season: "春", score: 8.15, episodes: null, format: null },
    { id: "medalist", title: "金牌得主", year: 2025, periodLabel: "2025 年冬季", season: "冬", score: 8.37, episodes: null, format: null },
    { id: "missing", title: "同名作品與續作，需要選擇正確版本的動畫", year: 2024, periodLabel: "2024 年春季", season: "春", score: 8.1 },
    { id: "error", title: "暫時無法取得資料的作品", year: 2024, periodLabel: "2024 年夏季", season: "夏", score: 8.0 },
  ].map(e => ({ ...e, media: "anime", searchUrl: `https://www.google.com/search?q=${encodeURIComponent(e.title)}` }));
  const media = {
    hyouka: { status: "ready", malId: 12189, title: "氷菓", originalTitle: "Hyouka", year: 2012, format: "TV", episodes: 22, coverUrl: "https://cdn.myanimelist.net/images/anime/13/50521l.jpg", trailerUrl: "https://www.youtube.com/watch?v=N5nNKAVB4O4", trailerTitle: "Hyouka Promo V2", trailerAuthor: "AnimaxAsia" },
    medalist: { status: "ready", malId: 55318, title: "メダリスト", originalTitle: "Medalist", year: 2025, format: "TV", episodes: 13, coverUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx165171-an9pyRXwVxJS.jpg", trailerUrl: "https://www.youtube.com/watch?v=yotDEXGaP9k", trailerTitle: "TVアニメ『メダリスト』PV第3弾｜ED主題歌：ねぐせ。「アタシのドレス」", trailerAuthor: "アニメ『メダリスト』公式チャンネル" },
    missing: { status: "unmatched", candidates: [] }, error: { status: "error" },
  };
  const opened = [], requested = [];
  const snapshot = () => ({ dataDir: temp, appVersion: "test", libraries: [ { media: "games", entries: [], sections: [], exists: true }, { media: "anime", entries, sections: [], exists: true } ], hiddenEntries: [] });
  ipcMain.handle("library:load", snapshot);
  ipcMain.handle("anime:resolve-media", (_, id, retry) => { requested.push({ id, retry }); return retry ? media.hyouka : media[id]; });
  ipcMain.handle("anime:search-media", () => ({ candidates: [media.hyouka, media.medalist] }));
  ipcMain.handle("anime:select-media", (_, id, malId) => Object.values(media).find(m => m.malId === malId));
  ipcMain.handle("external:open-urls", (_, urls) => { opened.push(...urls); return true; });
  ipcMain.handle("clipboard:write-text", () => true);
  ipcMain.handle("library:set-favorite", (_, _media, id, value) => { entries.find(e => e.id === id).favorite = value; return snapshot(); });
  const win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { backgroundThrottling: false, preload: path.join(root, "src/preload.cjs"), sandbox: true, contextIsolation: true } });
  const js = code => win.webContents.executeJavaScript(code, true);
  const until = async condition => { for (let n = 0; n < 180; n++) { if (await js(condition)) return; await new Promise(r => setTimeout(r,50)); } throw Error(`未達成：${condition}`); };
  const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const capture = async name => { if (process.env.CATCHLIST_QA_DIR) { await new Promise(r => setTimeout(r, 250)); fs.mkdirSync(process.env.CATCHLIST_QA_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.CATCHLIST_QA_DIR, `${name}.png`), (await win.webContents.capturePage()).toPNG()); } };
  await win.loadFile(path.join(root, "src/renderer/index.html"));
  await until("document.querySelector('[data-media=anime]') !== null");
  await click('[data-media="anime"]');
  await until("document.querySelectorAll('.anime-trailer-link').length === 2");
  await until("[...document.querySelectorAll('.anime-cover img')].every(img => img.complete && img.naturalWidth > 0)");
  await js("Promise.all([...document.querySelectorAll('.anime-cover img')].map(img => img.decode()))");
  win.setContentSize(1440, 1000);
  await new Promise(r => setTimeout(r, 500));
  await capture("anime-desktop");
  assert.equal(await js("document.documentElement.scrollWidth <= innerWidth"), true);
  await click('.anime-trailer-link');
  assert.equal(opened.length, 1);
  assert.match(opened[0], /^https:\/\/www.youtube.com\/watch\?v=/);
  await click('[data-anime-row="hyouka"] [data-cover]');
  assert.equal(await js("document.querySelector('#coverDialog').open"), true);
  await capture("anime-cover");
  await js("document.querySelector('#coverDialog').close()");
  await click('[data-anime-edit="missing"]');
  await until("document.querySelector('.anime-picker').open");
  await js("document.querySelector('.anime-picker form').requestSubmit()");
  await until("document.querySelectorAll('.anime-candidate').length === 2");
  await capture("anime-picker-desktop");
  await click('.anime-candidate');
  await until("!document.querySelector('.anime-picker').open");
  await until("document.querySelector('[data-anime-row=missing] .anime-cover img') !== null");
  await click('[data-anime-retry="error"]');
  await until("document.querySelector('[data-anime-row=error] .anime-cover img') !== null");
  assert.ok(requested.some(r => r.id === "error" && r.retry));
  await click('[data-anime-row=hyouka] [data-favorite]');
  await until("document.querySelector('[data-anime-row=hyouka]') === null");
  assert.equal(entries[0].favorite, true);
  await click('[data-view="favorites"]');
  await until("document.querySelector('[data-anime-row=hyouka] .anime-cover img') !== null");
  win.setContentSize(390, 844);
  await new Promise(r => setTimeout(r,200));
  await capture("anime-mobile");
  assert.equal(await js("document.documentElement.scrollWidth <= innerWidth"), true);
  await click('[data-anime-edit="hyouka"]');
  await until("document.querySelector('.anime-picker').open");
  await capture("anime-picker-mobile");
  assert.equal(await js("document.querySelector('.anime-picker').getBoundingClientRect().right <= innerWidth"), true);
  clearTimeout(timer);
  console.log(JSON.stringify({ desktop: true, mobile: true, trailerClick: true, coverPreview: true, identitySelection: true, retry: true, favorites: true, requested: requested.length }));
  win.destroy(); app.quit();
}).catch(error => { console.error(error.stack); clearTimeout(timer); app.exit(1); });
