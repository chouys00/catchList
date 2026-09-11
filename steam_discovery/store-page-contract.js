import { parseCommunityTags } from "./community-tags.js";
import { parseSteamLanguageSupport } from "./store-language-support.js";

export const UNKNOWN = "unknown";

function matchText(html, pattern) {
  return String(html).match(pattern)?.[1]?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || UNKNOWN;
}

function has(html, pattern) {
  return pattern.test(String(html));
}

function hardField(value) {
  return value ? true : UNKNOWN;
}

/**
 * A1 的唯讀契約檢查器。它不會發出網路請求，也不會把缺少的訊號當成 false。
 * 完整的快取、重試與產品解析器屬於 A3。
 */
export function inspectStorePageContract(html, { status = 200 } = {}) {
  const source = String(html ?? "");
  const ageGate = has(source, /id=["']agegate[_-]?box|id=["']app_agegate|請輸入您的出生日期/i);
  const title = matchText(source, /id=["']appHubAppName["'][^>]*>([\s\S]*?)<\/div>/i);
  const complete = status === 200 && !ageGate && title !== UNKNOWN;

  if (!complete) {
    return {
      pageState: ageGate ? "age_gate" : status === 200 ? "incomplete_200" : "http_error",
      retry: true,
      title: UNKNOWN,
      releaseDate: UNKNOWN,
      communityTags: [],
      supportTChinese: UNKNOWN,
      supportSChinese: UNKNOWN,
      isFree: UNKNOWN,
      hasInAppPurchases: UNKNOWN,
      hasMMO: UNKNOWN,
      vrMode: UNKNOWN,
      isEarlyAccess: UNKNOWN,
      globalLifetimeReviews: UNKNOWN,
      globalLifetimeReason: "頁面不完整，禁止推論硬性欄位"
    };
  }

  const userReviews = source.match(/id=["']userReviews["'][\s\S]*?<\/div>\s*<\/div>/i)?.[0] ?? "";
  const hasGlobalLifetimeRow = /全部評論\s*：|All Reviews\s*:/i.test(userReviews);

  return {
    pageState: "complete",
    retry: false,
    title,
    releaseDate: matchText(source, /class=["']date["'][^>]*>([\s\S]*?)<\/div>/i),
    communityTags: parseCommunityTags(source),
    supportTChinese: parseSteamLanguageSupport(source, "繁體中文"),
    supportSChinese: parseSteamLanguageSupport(source, "簡體中文"),
    isFree: hardField(has(source, /\/genre\/Free%20to%20Play\//i) && has(source, /data-price-final=["']0["']/i)),
    hasInAppPurchases: hardField(has(source, /遊戲內購買|In-App Purchases/i)),
    hasMMO: hardField(has(source, /category2=20(?:[&"'])|大型多人線上|Massively Multiplayer/i)),
    vrMode: has(source, /vrsupport=401(?:[&"'])|僅限 VR|VR Only/i)
      ? "only"
      : has(source, /vrsupport=402(?:[&"'])|支援 VR|VR Supported/i)
        ? "supported"
        : UNKNOWN,
    isEarlyAccess: hardField(has(source, /id=["']earlyAccessHeader["']|搶先體驗遊戲|Early Access Game/i)),
    // 繁中頁的微資料是目前語言的終身評價；沒有「全部評論」列時不能冒充全球終身資料。
    globalLifetimeReviews: hasGlobalLifetimeRow ? "unverified" : UNKNOWN,
    globalLifetimeReason: hasGlobalLifetimeRow
      ? "需要與官方 all-language 對照後才可使用"
      : "頁面只有最近全語系與目前語言終身評價"
  };
}
