const clean = (value) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
export class SteamVerificationRequired extends Error {
  constructor(appid) {
    super("Steam 要求先完成官方確認，才能讀取此遊戲資訊");
    this.code = "STEAM_VERIFICATION_REQUIRED";
    this.appid = String(appid);
  }
}
export function isSteamAgePage(html) {
  return /<(?:form|div|select)\b[^>]*(?:id|class)=["'][^"']*\b(?:agecheck_form|agegate_box|app_agegate|agegate_birthday_selector)\b/i.test(String(html));
}
export function parseSteamInput(input) {
  const raw = String(input ?? "").trim();
  if (/^[1-9]\d{0,9}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/^\/app\/([1-9]\d{0,9})(?:\/|$)/);
    if (url.protocol === "https:" && url.hostname === "store.steampowered.com" && !url.username && !url.password && !url.port && match) return match[1];
  } catch { /* 下方統一回報輸入錯誤 */ }
  throw new Error("請輸入 Steam AppID 或 https://store.steampowered.com/app/… 商店網址");
}
export function exactReleaseDate(raw) {
  const text = clean(raw);
  const zh = text.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日$/);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const en = text.match(/^(\d{1,2})\s+([A-Za-z]{3}),?\s+(\d{4})$/);
  let parts = zh?.slice(1) ?? iso?.slice(1);
  if (!parts && en) parts = [en[3], String(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(en[2]) + 1), en[1]];
  if (!parts) return null;
  const [year, month, day] = parts.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
}
export function parseGameDetails(appid, response) {
  const data = response?.[appid]?.success && response[appid].data;
  if (!data || !clean(data.name)) throw new Error("找不到遊戲，可能已下架、受地區限制或 ID 不正確");
  if (data.type !== "game") throw new Error("只支援遊戲本體，不支援 DLC、試玩版或工具軟體");
  const languages = clean(data.supported_languages);
  return { appid, title: clean(data.name), originalTitle: "", releaseDate: exactReleaseDate(data.release_date?.date),
    releaseLabel: clean(data.release_date?.date) || (data.release_date?.coming_soon ? "尚未發售" : "未公布日期"),
    comingSoon: Boolean(data.release_date?.coming_soon), score: null, reviews: null,
    officialFeatureIds: (data.categories ?? []).map((category) => category.id).filter((id) => Number.isInteger(id) && id > 0),
    chineseSupport: !languages ? "unknown" : /繁體中文|簡體中文|Traditional Chinese|Simplified Chinese/i.test(languages) ? "supported" : "unsupported",
    genres: (data.genres ?? []).map((g) => clean(g.description)).filter(Boolean), tags: [] };
}
export function parseReviewSummary(response) {
  const data = response?.response?.query_summary ?? (response?.success === 1 && response.query_summary);
  if (!data || !Number.isInteger(data.total_reviews) || data.total_reviews < 0 || !Number.isInteger(data.total_positive)
    || data.total_positive < 0 || data.total_positive > data.total_reviews) throw new Error("評論資料不完整");
  return { score: data.total_reviews ? Math.round(data.total_positive / data.total_reviews * 100) : null, reviews: data.total_reviews };
}
export function parseTags(html) {
  return [...new Set([...String(html).matchAll(/<a\b[^>]*class=["'][^"']*\bapp_tag\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => clean(match[1])).filter(Boolean))].slice(0, 20);
}
function steamRequest(signal, fetcher, appid) {
  return async function request(url, json = true, source = "Steam 商店") {
    let response;
    try {
      response = await fetcher(url, { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]), redirect: "manual",
        headers: { "User-Agent": "CatchListReader/1.0" } });
    } catch (error) {
      if (signal?.aborted) throw new Error("已取消讀取", { cause: error });
      throw new Error(error.name === "TimeoutError" ? `${source}回應逾時，請稍後重試` : `${source}連線失敗，請檢查網路後重試`, { cause: error });
    }
    if (response.status >= 300 && response.status < 400) {
      const target = new URL(response.headers?.get("location") || "/", url);
      if (new URL(url).origin === "https://store.steampowered.com" && target.origin === "https://store.steampowered.com" && !target.username && !target.password
        && target.pathname.replace(/\/$/, "") === `/agecheck/app/${appid}`) throw new SteamVerificationRequired(appid);
      throw new Error(`${source}回傳轉址，未取得遊戲資訊，請稍後重試`);
    }
    if (!response.ok) throw new Error(response.status === 429 ? "Steam 暫時限制請求，請稍後重試" : `Steam 讀取失敗（${response.status}）`);
    try { return await (json ? response.json() : response.text()); }
    catch (error) {
      if (signal?.aborted) throw new Error("已取消讀取", { cause: error });
      throw new Error(`${source}資料讀取不完整，請稍後重試`, { cause: error });
    }
  };
}
export async function lookupSteamTags(input, { signal, fetcher = fetch } = {}) {
  const appid = parseSteamInput(input);
  const html = await steamRequest(signal, fetcher, appid)(`https://store.steampowered.com/app/${appid}/?cc=tw&l=tchinese`, false);
  if (isSteamAgePage(html)) throw new SteamVerificationRequired(appid);
  const tags = parseTags(html);
  if (!tags.length) throw new Error("Steam 未提供社群標籤，已保留原資訊");
  return tags;
}
function reviewSummaryUrl(appid) {
  // Steam 已停用 /appreviews；新介面使用 input_json 與數值列舉，無需金鑰。
  const url = new URL("https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/");
  url.searchParams.set("input_json", JSON.stringify({ appid: Number(appid), filter: 0, languages: ["all"],
    review_type: 0, purchase_type: 0, cursor: "*", day_range: 365, num_per_page: 1 }));
  return url.href;
}
export async function lookupSteamStats(input, { signal, fetcher = fetch } = {}) {
  const appid = parseSteamInput(input);
  const request = steamRequest(signal, fetcher, appid);
  const summary = parseReviewSummary(await request(reviewSummaryUrl(appid), true, "Steam 評論"));
  const tags = await lookupSteamTags(appid, { signal, fetcher });
  return { ...summary, tags };
}
export async function lookupSteamGame(input, { signal, fetcher = fetch } = {}) {
  const appid = parseSteamInput(input);
  const request = steamRequest(signal, fetcher, appid);
  const game = parseGameDetails(appid, await request(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=tw&l=tchinese`));
  const warnings = [];
  try { Object.assign(game, parseReviewSummary(await request(reviewSummaryUrl(appid), true, "Steam 評論"))); }
  catch (error) { if (signal?.aborted) throw error; warnings.push(`評論讀取失敗：${error.message}`); }
  try { game.tags = await lookupSteamTags(appid, { signal, fetcher }); }
  catch (error) { if (signal?.aborted) throw error; if (error.code === "STEAM_VERIFICATION_REQUIRED") game.verificationRequired = true; warnings.push(`社群標籤讀取失敗：${error.message}`); }
  if (signal?.aborted) throw new Error("已取消讀取");
  return { ...game, fetchedAt: new Date().toISOString(), warnings };
}
