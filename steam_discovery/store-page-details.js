import { parseCommunityTags } from "./community-tags.js";

export const STORE_PAGE_PARSER_VERSION = 3;
export const UNKNOWN = "unknown";

function text(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function match(html, pattern) {
  return text(String(html).match(pattern)?.[1]) || UNKNOWN;
}

function has(html, pattern) {
  return pattern.test(String(html));
}

function knownIfPresent(value) {
  return value ? true : UNKNOWN;
}

function tagRecords(html) {
  const records = [];
  for (const node of String(html).matchAll(/<a\b([^>]*\bclass=["'][^"']*\bapp_tag\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
    const id = node[1].match(/\bdata-tagid=["'](\d+)["']/i)?.[1] ?? null;
    const name = text(node[2]);
    if (!name || records.some((record) => record.id === id && record.name === name)) continue;
    records.push({ id, name });
    if (records.length === 20) break;
  }
  return records;
}

/**
 * 僅解析單一繁中臺灣商店 HTML；缺少正向訊號一律保留 unknown。
 * 評論數不在此解析，必須由 FronkonGames 固定資料集提供。
 */
export function parseStorePageDetails(html, { appid, status = 200 } = {}) {
  const source = String(html ?? "");
  const ageGate = has(source, /id=["']agegate[_-]?box|id=["']app_agegate|請輸入您的出生日期/i);
  const title = match(source, /id=["']appHubAppName["'][^>]*>([\s\S]*?)<\/div>/i);
  const complete = status === 200 && !ageGate && title !== UNKNOWN;
  const base = {
    schemaVersion: 1,
    parserVersion: STORE_PAGE_PARSER_VERSION,
    appid: String(appid ?? ""),
    source: { locale: "tchinese", country: "tw" }
  };

  if (!complete) {
    const pageState = ageGate ? "age_gate" : status === 200 ? "incomplete_200" : "http_error";
    return {
      ...base,
      pageState,
      retry: pageState === "http_error",
      reasons: [pageState],
      title: UNKNOWN,
      releaseDate: UNKNOWN,
      communityTags: [],
      supportTChinese: UNKNOWN,
      supportSChinese: UNKNOWN,
      isFree: UNKNOWN,
      hasInAppPurchases: UNKNOWN,
      hasMMO: UNKNOWN,
      vrMode: UNKNOWN,
      isEarlyAccess: UNKNOWN
    };
  }

  const tags = tagRecords(source);
  const isFree = has(source, /\/genre\/Free%20to%20Play\//i) && has(source, /data-price-final=["']0["']/i);
  const hasInAppPurchases = has(source, /遊戲內購買|In-App Purchases/i);
  const hasMMO = has(source, /category2=20(?:[&"'])|大型多人線上|Massively Multiplayer/i);
  const isEarlyAccess = has(source, /id=["']earlyAccessHeader["']|搶先體驗遊戲|Early Access Game/i);
  return {
    ...base,
    pageState: "complete",
    retry: false,
    reasons: [],
    title,
    releaseDate: match(source, /class=["']date["'][^>]*>([\s\S]*?)<\/div>/i),
    // communityTags 保留既有相容格式；tagRecords 同時提供優先使用的穩定 ID。
    communityTags: tags.length ? tags.map((tag) => tag.name) : parseCommunityTags(source),
    tagRecords: tags,
    supportTChinese: knownIfPresent(has(source, /<td[^>]*>\s*繁體中文\s*<\/td>/i)),
    supportSChinese: knownIfPresent(has(source, /<td[^>]*>\s*簡體中文\s*<\/td>/i)),
    // 完整頁面只在有明確免費訊號時排除；其餘視為非免費，避免因缺少價格區塊誤刪。
    isFree,
    hasInAppPurchases,
    hasMMO,
    vrMode: has(source, /vrsupport=401(?:[&"'])|僅限 VR|VR Only/i)
      ? "only"
      : has(source, /vrsupport=402(?:[&"'])|支援 VR|VR Supported/i)
        ? "supported"
        : "none",
    isEarlyAccess
  };
}
