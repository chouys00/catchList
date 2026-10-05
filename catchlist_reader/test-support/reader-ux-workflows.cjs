const { app, BrowserWindow, ipcMain, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-ux-ui-"));
app.setPath("userData", path.join(temp, "profile"));
const timer = setTimeout(() => { console.error("整合測試逾時"); app.exit(1); }, 55000);
app.whenReady().then(async () => {
  session.defaultSession.protocol.handle("https", () => new Response('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>', { headers: { "Content-Type": "image/svg+xml" } }));
  const libraries = ["games", "anime", "movies", "liveAction"].map(media => ({ media, exists: true, sections: [],
    entries: Array.from({ length: media === "games" ? 600 : 80 }, (_, i) => ({
      media, id: `${media}-${i}`, appid: media === "games" ? String(1000+i) : undefined,
      title: `${media} ${String(i).padStart(4,"0")}`, score: 90-i/1000, year: 2025, month: 1,
      season: "春", category: "電影", region: "日劇", releaseDate: "2025-01-01", imdbScore: 8, votes: 1000,
      url: "https://example.test/", searchUrl: "https://example.test/", tags: Array.from({length:12},(_,n)=>`標籤 ${n}`),
    })) }));
  const snapshot = () => ({ dataDir: temp, appVersion: "test", libraries, hiddenEntries: [] });
  const requested = [], opened = [];
  ipcMain.handle("library:load", snapshot);
  ipcMain.handle("library:resolve-game-covers", (_, ids) => Object.fromEntries(ids.map(id=>[id,"https://example.test/cover.svg"])));
  ipcMain.handle("anime:resolve-media", (_, id) => { requested.push(id); return { status:"ready", malId:60001, title:"測試動畫", year:2025, format:"TV", episodes:12, coverUrl:"https://cdn.myanimelist.net/images/anime/13/50521l.jpg", trailerUrl:"https://www.youtube.com/watch?v=N5nNKAVB4O4" }; });
  ipcMain.handle("external:open-urls", (_, urls) => { opened.push(...urls); return true; });
  const win = new BrowserWindow({ show:false, width:1440, height:900, webPreferences:{backgroundThrottling:false, preload:path.join(root,"src/preload.cjs"), sandbox:true, contextIsolation:true} });
  const js = code => win.webContents.executeJavaScript(code,true);
  const pause = () => new Promise(r=>setTimeout(r,50));
  const until = async code => { for(let n=0;n<160;n++){if(await js(code))return;await pause();}throw Error(code); };
  const select = async media => { await js(`document.querySelector('[data-media=${media}]').click()`); await until(`document.querySelector('.item.${media === "liveAction" ? "live-action" : media}') !== null`); await pause(); };
  await win.loadFile(path.join(root,"src/renderer/index.html"));
  await until("document.querySelectorAll('[data-game-row]').length === 50");
  await js("for(let i=0;i<9;i++) document.querySelector('[data-action=load-more-games]').click()");
  await until("document.querySelectorAll('[data-game-row] img').length === 500");
  await js("window.scrollTo({top:2000,behavior:'instant'})"); await pause();
  await js(`window.uxRows=[...document.querySelectorAll('[data-game-row]')]; window.uxCovers=uxRows.map(r=>r.querySelector('img')); window.uxSentinel=document.querySelector('[data-game-load-sentinel]'); window.uxTop=scrollY; window.uxTarget=uxRows[10]; window.uxButton=uxTarget.querySelector('[data-expand-tags]'); uxButton.focus({preventScroll:true});`);
  const expandMs = await js("(()=>{const start=performance.now();uxButton.click();return performance.now()-start})()");
  assert.equal(await js("uxButton.getAttribute('aria-expanded')"),"true");
  assert.equal(await js("uxTarget.querySelectorAll('[data-game-tag]').length"),12);
  const preserved = await js("uxRows.filter((row,i)=>document.querySelectorAll('[data-game-row]')[i] === row).length");
  assert.equal(preserved,500);
  assert.deepEqual(await js("({covers:uxRows.every((row,i)=>row.querySelector('img') === uxCovers[i]), sentinel:uxSentinel === document.querySelector('[data-game-load-sentinel]'), focus:document.activeElement === uxButton, scroll:scrollY-uxTop})"),{covers:true,sentinel:true,focus:true,scroll:0});
  // 真實鍵盤事件走原生按鈕 activation，確認收合後焦點仍可繼續使用。
  const start = performance.now();
  win.webContents.focus();
  win.webContents.sendInputEvent({type:"keyDown",keyCode:"Enter"});
  win.webContents.sendInputEvent({type:"char",keyCode:"\r"});
  win.webContents.sendInputEvent({type:"keyUp",keyCode:"Enter"});
  await until("uxButton.getAttribute('aria-expanded') === 'false'");
  const collapseMs = performance.now()-start;
  assert.equal(await js("uxTarget.querySelectorAll('[data-game-tag]').length"),6);
  assert.equal(await js("document.activeElement === uxButton && scrollY === uxTop && uxRows.every((r,i)=>document.querySelectorAll('[data-game-row]')[i] === r && r.querySelector('img') === uxCovers[i])"),true);
  await js("uxTarget.querySelector('[data-open]').click()"); await pause(); assert.equal(opened.length,1);
  await js("uxTarget.querySelector('[data-cover]').click()"); assert.equal(await js("document.querySelector('#coverDialog').open"),true);
  await js("document.querySelector('#coverDialog').close(); window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})");
  await until("document.querySelectorAll('[data-game-row]').length >= 550");
  assert.equal(await js("uxRows.every((r,i)=>document.querySelectorAll('[data-game-row]')[i] === r)"),true);
  // 三項在同一 renderer 的整合驗收：媒體續讀及搜尋未可視動畫。
  await js("window.scrollTo({top:3000,behavior:'instant'})"); await pause();
  const gameTop = await js("scrollY");
  await select("anime"); assert.equal(await js("scrollY"),0);
  await js("window.scrollTo({top:1400,behavior:'instant'})"); await pause();
  const animeTop = await js("scrollY");
  await select("movies"); assert.equal(await js("scrollY"),0);
  await select("liveAction"); assert.equal(await js("scrollY"),0);
  const switchStart = performance.now(); await select("games");
  const switchMs = performance.now()-switchStart;
  assert.ok(Math.abs(await js("scrollY")-gameTop)<=2);
  await select("anime"); assert.ok(Math.abs(await js("scrollY")-animeTop)<=2);
  assert.equal(requested.includes("anime-79"),false);
  const searchStart = performance.now();
  await js(`(()=>{const input=document.querySelector('[data-filter=query]');input.value='anime 0079';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await until("document.querySelector('[data-anime-row=anime-79] img')?.naturalWidth > 0");
  const searchMs = performance.now()-searchStart;
  assert.ok(requested.includes("anime-79"));
  const calls = requested.filter(id=>id==="anime-79").length;
  await js("document.querySelector('[data-action=clear-search]').click()");
  await until("document.querySelectorAll('[data-anime-row]').length === 80");
  await js(`(()=>{const input=document.querySelector('[data-filter=query]');input.value='anime 0079';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await until("document.querySelector('[data-anime-row=anime-79] img')?.naturalWidth > 0");
  assert.equal(requested.filter(id=>id==="anime-79").length,calls);
  const result={ preservedRows:preserved, coversPreserved:true, focusPreserved:true, keyboard:true, sentinel:true, animeSearch:true, mediaScroll:true, timingsMs:{expand:expandMs,collapse:collapseMs,mediaSwitch:switchMs,animeSearch:searchMs} };
  if(process.env.CATCHLIST_UX_EVIDENCE) fs.writeFileSync(process.env.CATCHLIST_UX_EVIDENCE,JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify(result)); clearTimeout(timer);win.destroy();app.quit();
}).catch(error=>{console.error(error.stack);clearTimeout(timer);app.exit(1);});
