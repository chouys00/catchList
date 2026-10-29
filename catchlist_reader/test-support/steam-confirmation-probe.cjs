// 背景檢查隔離驗收留下的網站狀態；不開視窗、不輸出 Cookie 或登入內容。
const { app } = require("electron");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const profile = path.resolve(process.argv.find(arg => arg.startsWith("--profile="))?.slice(10) || ".");
const parent = path.dirname(profile);
if (!path.basename(parent).startsWith("catchlist-steam-live-") || path.dirname(parent).toLowerCase() !== path.resolve(os.tmpdir()).toLowerCase()) throw new Error("僅允許隔離驗收 profile");
app.setPath("userData", profile);
app.whenReady().then(async () => {
  const { SteamAccess } = await import(pathToFileURL(path.resolve(__dirname, "../src/steam-access.js")));
  const service = new SteamAccess({ getParent: () => null });
  const result = { appid: "3962420", backgroundProbe: true, hasWebsiteData: (await service.status()).hasWebsiteData };
  try {
    const stats = await service.lookupStats("3962420");
    Object.assign(result, { completed: true, score: stats.score, reviews: stats.reviews, tags: stats.tags.length });
  } catch (error) { Object.assign(result, { completed: false, error: error.message, code: error.code }); }
  const output = path.resolve(__dirname, "../../output/steam-confirmation-qa");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "live-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  app.exit(0);
}).catch(error => { console.error(error.message); app.exit(1); });
