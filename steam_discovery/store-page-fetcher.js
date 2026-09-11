import { delay, getWithRetry } from "@catchlist/core";
import { parseStorePageDetails, STORE_PAGE_PARSER_VERSION } from "./store-page-details.js";

const STEAM_HEADERS = {
  "User-Agent": "CatchList Steam initialization/1.0 (+https://store.steampowered.com/)",
  // 固定成人日期只用於 Steam 年齡確認，不含帳號、登入狀態或使用者個資。
  Cookie: "birthtime=315532801; lastagecheckage=1-January-1980; wants_mature_content=1"
};

function responseData(response) {
  return {
    status: response.status ?? 200,
    headers: response.headers ?? {},
    html: typeof response.data === "string" ? response.data : String(response.data ?? "")
  };
}
/**
 * 使用原始頁快取優先：成功快取不會再次發送請求；解析器版本變更時直接離線重解析。
 */
export async function getStorePageDetails(appid, {
  cache,
  requester = getWithRetry,
  wait = delay,
  now = () => new Date().toISOString(),
  minIntervalMs = 1500,
  retries = 3,
  parserVersion = STORE_PAGE_PARSER_VERSION
} = {}) {
  if (!cache) throw new Error("需要初始化快取");
  const progress = cache.loadProgress().entries[String(appid)];
  const structured = cache.loadStructured(appid, parserVersion);
  // 年齡驗證與不完整頁面雖可供稽核，仍必須在下次續跑時重新請求。
  if (structured && progress?.state !== "retry") return { source: "structured_cache", details: structured.details };

  const raw = cache.loadRaw(appid);
  // 待重試頁面不能因為保留了不完整 HTML 而永遠跳過下一次請求。
  if (raw && progress?.state !== "retry") {
    const details = { ...parseStorePageDetails(raw.html, { appid, status: raw.status }), parserVersion };
    cache.saveStructured(appid, details, now());
    cache.recordProgress(appid, { state: details.retry ? "retry" : "success", reason: details.reasons[0], attempts: 0 });
    return { source: "raw_cache", details };
  }

  cache.recordProgress(appid, { state: "in_progress", attempts: 1 });
  let madeNetworkRequest = false;
  try {
    madeNetworkRequest = true;
    const response = await requester(`https://store.steampowered.com/app/${appid}`, {
      params: { cc: "tw", l: "tchinese" },
      headers: STEAM_HEADERS,
      timeout: 15000
    }, {
      label: `initialize app=${appid}`,
      retries,
      baseDelay: minIntervalMs,
      rateLimitBaseDelay: minIntervalMs
    });
    const rawRecord = cache.saveRaw(appid, { ...responseData(response), fetchedAt: now() });
    const details = { ...parseStorePageDetails(rawRecord.html, { appid, status: rawRecord.status }), parserVersion };
    cache.saveStructured(appid, details, now());
    cache.recordProgress(appid, { state: details.retry ? "retry" : "success", reason: details.reasons[0], attempts: 1 });
    return { source: "network", details };
  } catch (error) {
    const status = error.response?.status;
    const retryable = status == null || status === 429 || status >= 500;
    cache.recordProgress(appid, {
      state: retryable ? "retry" : "failed",
      reason: status === 429 ? "http_429" : status >= 500 ? `http_${status}` : status ? `http_${status}` : "network_error",
      attempts: 1
    });
    throw error;
  } finally {
    // 由呼叫端串行處理候選，確保兩次商店請求間隔固定；快取命中不等待。
    if (madeNetworkRequest) await wait(minIntervalMs);
  }
}
