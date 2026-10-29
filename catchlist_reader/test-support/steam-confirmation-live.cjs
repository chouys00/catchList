// 需由使用者本人操作官方頁面。只讀遠端資訊，不寫入正式清單或輸出 Cookie。
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "catchlist-steam-live-"));
app.setPath("userData", path.join(temp, "profile"));
app.whenReady().then(async () => {
  const { SteamAccess } = await import(pathToFileURL(path.resolve(__dirname, "../src/steam-access.js")));
  const parent = new BrowserWindow({ width: 600, height: 300, show: true, title: "CatchList 隔離驗收", webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await parent.loadURL("data:text/html;charset=utf-8," + encodeURIComponent('<!doctype html><meta charset="UTF-8"><body style="background:#111315;color:#f0eadf;font:18px sans-serif;padding:24px"><h2>CatchList 隔離驗收</h2><p>正在測試 Steam 連線，稍後將開啟官方確認視窗。</p><p>本次不修改正式清單。</p></body>'));
  const service = new SteamAccess({ getParent: () => parent });
  const ordinary = await service.lookupStats("413150");
  console.log(JSON.stringify({ ordinary: true, appid: "413150", score: ordinary.score, reviews: ordinary.reviews, tags: ordinary.tags.length }));
  let required = false;
  try { await service.lookupStats("3962420"); }
  catch (error) { if (error.code === "STEAM_VERIFICATION_REQUIRED") required = true; else throw error; }
  const result = { appid: "3962420", required, completed: !required, ordinary: true };
  if (required) result.completed = await service.open({ appid: "3962420", title: "Futa Slug EX", signal: new AbortController().signal });
  if (result.completed) {
    const stats = await service.lookupStats("3962420");
    Object.assign(result, { score: stats.score, reviews: stats.reviews, tags: stats.tags.length });
  }
  const output = path.resolve(__dirname, "../../output/steam-confirmation-qa");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "live-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  app.exit(0);
}).catch(error => { console.error(error.message); app.exit(1); });
