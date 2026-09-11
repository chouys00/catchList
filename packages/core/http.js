// ============================================================
// http.js — 含指數退避重試的 HTTP GET
// ============================================================

import axios from "axios";

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function getRetryDelayMs({
  status,
  attempt,
  baseDelay,
  rateLimitBaseDelay = baseDelay,
  retryAfter,
  now = Date.now()
}) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  if (status !== 429) return exponentialDelay;

  const retryAfterSeconds = Number.parseFloat(retryAfter);
  const retryAfterDate = typeof retryAfter === "string" && Number.isNaN(retryAfterSeconds)
    ? Date.parse(retryAfter)
    : NaN;
  const retryAfterMs = Number.isFinite(retryAfterSeconds)
    ? Math.max(0, retryAfterSeconds * 1000)
    : Number.isFinite(retryAfterDate)
      ? Math.max(0, retryAfterDate - now)
      : 0;

  return Math.max(exponentialDelay, rateLimitBaseDelay, retryAfterMs);
}

/**
 * axios GET 加上指數退避重試。429/5xx/網路錯誤會重試,4xx(除 429)不重試。
 * @param {string} url
 * @param {object} [axiosOpts] - 傳給 axios 的設定(params, headers, timeout...)
 * @param {object} [retryOpts]
 * @param {number} [retryOpts.retries=3]   - 最多重試次數(不含第一次)
 * @param {number} [retryOpts.baseDelay=1500] - 首次重試等待毫秒,之後指數成長
 * @param {number} [retryOpts.rateLimitBaseDelay=baseDelay] - 429 無 Retry-After 時的最低等待毫秒
 * @param {string} [retryOpts.label]       - log 用的標籤
 * @returns {Promise<import("axios").AxiosResponse>}
 */
export async function getWithRetry(url, axiosOpts = {}, retryOpts = {}) {
  const {
    retries = 3,
    baseDelay = 1500,
    rateLimitBaseDelay = baseDelay,
    label = url
  } = retryOpts;
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, axiosOpts);
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const retryable = status == null || status === 429 || status >= 500;
      if (!retryable || attempt === retries) break;

      const wait = getRetryDelayMs({
        status,
        attempt,
        baseDelay,
        rateLimitBaseDelay,
        retryAfter: err.response?.headers?.["retry-after"]
      });
      console.warn(
        `  [HTTP] ${label} 失敗(${status ?? err.code ?? err.message}),` +
        `${wait / 1000}s 後重試 (${attempt + 1}/${retries})`
      );
      await delay(wait);
    }
  }
  throw lastErr;
}
