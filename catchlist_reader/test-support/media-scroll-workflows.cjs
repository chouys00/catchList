const { app, BrowserWindow, ipcMain, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-scroll-ui-"));
app.setPath("userData", path.join(temp, "profile"));
const timer = setTimeout(() => { console.error("捲動互動測試逾時"); app.exit(1); }, 55000);

app.whenReady().then(async () => {
  session.defaultSession.protocol.handle("https", () => new Response("", { status: 404 }));
  const libraries = ["games", "anime", "movies", "liveAction"].map(media => ({
    media, exists: true, sections: [], entries: Array.from({ length: media === "games" ? 1000 : 80 }, (_, i) => ({
      media, id: `${media}-${i}`, appid: media === "games" ? String(1000 + i) : undefined,
      title: `${media} 群組 ${String(i).padStart(4, "0")}`, score: 90 - i / 1000,
      year: 2025, month: 1, releaseDate: "2025-01-01", season: "春", category: "電影", region: "日劇",
      searchUrl: "https://example.test/", url: "https://example.test/", imdbScore: 8, votes: 1000, tags: ["單人"],
    })),
  }));
  const snapshot = version => ({ dataDir: temp, appVersion: version, libraries, hiddenEntries: [] });
  let deferred = false;
  const pending = [];
  ipcMain.handle("library:load", (_, media) => deferred
    ? new Promise((resolve, reject) => pending.push({ media, resolve, reject })) : snapshot("ready"));
  ipcMain.handle("library:resolve-game-covers", () => ({}));
  ipcMain.handle("anime:resolve-media", () => ({ status: "unmatched", candidates: [] }));
  const win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: {
    backgroundThrottling: false, preload: path.join(root, "src/preload.cjs"), sandbox: true, contextIsolation: true,
  } });
  const js = code => win.webContents.executeJavaScript(code, true);
  const wait = () => new Promise(r => setTimeout(r, 50));
  const until = async condition => {
    for (let n = 0; n < 160; n++) { if (await js(condition)) return; await wait(); }
    throw Error(`未達成：${condition}`);
  };
  const select = async media => {
    await js(`document.querySelector('[data-media="${media}"]').click()`);
    await until(`document.querySelector('.tab.active').dataset.media === '${media}' && document.querySelector('.item.${media === "liveAction" ? "live-action" : media}') !== null`);
    await wait();
  };
  const scroll = async top => {
    await js(`window.scrollTo({top:${top},behavior:'instant'})`); await wait();
    return js("scrollY");
  };
  const near = async (expected, message) => assert.ok(Math.abs(await js("scrollY") - expected) <= 2, message);
  await win.loadFile(path.join(root, "src/renderer/index.html"));
  await until("document.querySelectorAll('[data-game-row]').length === 50");
  // 先載入多批並讀到首批以外；切回時不能被 50 列的高度截短。
  await js(`for(let i=0;i<3;i++) document.querySelector('[data-action="load-more-games"]').click()`);
  assert.equal(await js("document.querySelectorAll('[data-game-row]').length"), 200);
  const gameTop = await scroll(12000);
  assert.ok(gameTop > 5000);
  const gameCount = await js("document.querySelectorAll('[data-game-row]').length");
  const positions = { games: gameTop };
  for (const [media, top] of [["anime", 1600], ["movies", 2400], ["liveAction", 3200]]) {
    await select(media); await near(0, `${media} 首次到頂`);
    positions[media] = await scroll(top);
  }
  for (const media of ["games", "anime", "movies", "liveAction"]) {
    await select(media); await near(positions[media], `${media} 恢復獨立位置`);
    if (media === "games") assert.ok(await js("document.querySelectorAll('[data-game-row]').length") >= gameCount);
  }
  // 篩選保留，短頁面會合理截到可用範圍，不借用別的媒體位置。
  await select("movies");
  await js(`(() => { const input=document.querySelector('[data-filter=query]'); input.value='movies 群組 0001'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await until("document.querySelectorAll('.item.movies').length === 1");
  const shortTop = await js("scrollY");
  await select("anime"); await near(positions.anime, "動畫位置未受電影篩選影響");
  await select("movies"); await near(shortTop, "短清單恢復可用位置");
  assert.equal(await js("document.querySelector('[data-filter=query]').value"), "movies 群組 0001");
  await js("document.querySelector('[data-action=clear-search]').click()");
  await scroll(positions.movies);
  // 返回後來源變短，舊位置只能截到新頁面底端。
  await select("anime");
  const movies = libraries.find(l => l.media === "movies");
  movies.entries = movies.entries.slice(0, 2);
  await select("movies");
  await until("document.querySelectorAll('.item.movies').length === 2");
  await near(await js("Math.max(0,document.documentElement.scrollHeight-innerHeight)"), "更新後短頁面截到頁尾");
  // 切換中立刻顯示目的頁與位置，延遲載入不得覆蓋使用者已捲到的新位置。
  deferred = true;
  await select("anime");
  const duringLoad = await scroll(2100);
  assert.equal(pending.length, 1);
  pending.shift().resolve(snapshot("delayed"));
  await until("document.title.includes('delayed')");
  await near(duringLoad, "等待載入期間的捲動保留");
  // A→B→A：三個請求逆序完成，舊的相同媒體回應與錯誤都不能套用。
  await js(`document.querySelector('[data-media=games]').click(); document.querySelector('[data-media=liveAction]').click(); document.querySelector('[data-media=games]').click();`);
  for (let n = 0; pending.length < 3 && n < 100; n++) await wait();
  assert.deepEqual(pending.map(p => p.media), ["games", "liveAction", "games"]);
  await near(positions.games, "快速切回仍恢復遊戲位置");
  const [oldGames, oldTv, newGames] = pending.splice(0);
  newGames.resolve(snapshot("newest"));
  await until("document.title.includes('newest')");
  const currentTop = await scroll(13000);
  oldGames.resolve(snapshot("stale")); oldTv.reject(Error("過時載入錯誤"));
  await new Promise(r => setTimeout(r, 200));
  assert.equal(await js("document.title"), "CatchList 閱讀器 newest");
  assert.equal(await js("document.querySelector('.tab.active').dataset.media"), "games");
  assert.equal(await js("document.querySelector('#toast').textContent.includes('過時載入錯誤')"), false);
  await near(currentTop, "舊回應未改動遊戲位置");
  assert.ok(await js("document.querySelectorAll('[data-game-row]').length") >= gameCount);
  // 相同內容在窄視窗變高、再切回寬視窗：已記住的批次不夠時需補載。
  deferred = false;
  win.setContentSize(390, 844);
  await until("innerWidth === 390");
  await new Promise(r => setTimeout(r, 200));
  const tallTop = await scroll(50000);
  const narrowCount = await js("document.querySelectorAll('[data-game-row]').length");
  await select("anime");
  win.setContentSize(1440, 900);
  await until("innerWidth === 1440");
  await new Promise(r => setTimeout(r, 200));
  await select("games");
  await near(tallTop, "恢復前補載足夠遊戲內容");
  assert.ok(await js("document.querySelectorAll('[data-game-row]').length") > narrowCount, `窄頁 ${narrowCount} 列、位置 ${tallTop}，寬頁應補載更多列`);
  console.log(JSON.stringify({ independentMedia: true, gameBatches: true, filters: true, shorterPage: true, pendingScroll: true, staleLoads: true, resizedBatches: true }));
  clearTimeout(timer); win.destroy(); app.quit();
}).catch(error => { console.error(error.stack); clearTimeout(timer); app.exit(1); });
