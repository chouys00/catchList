import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";
import { normalizeShowCandidate } from "../schema.js";
import { resolveTmdbToken } from "../env.js";

const API_BASE = "https://api.themoviedb.org/3";
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_CACHE_FILE = path.join(PACKAGE_ROOT, ".cache", "tmdb.json");

function requireToken(env) {
  const token = resolveTmdbToken(env);
  if (typeof token !== "string" || token.trim() === "") {
    throw new Error("缺少 TMDB_API_TOKEN；尚未發出 TMDb 網路請求。");
  }
  return token;
}

function isRetryable(error) {
  if (error?.retryable === false) return false;
  const status = error?.response?.status;
  return status == null || status === 429 || status >= 500;
}

function readCache(cacheFile) {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch {
    return {};
  }
}

function writeCache(cacheFile, cache) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const temporaryFile = `${cacheFile}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryFile, JSON.stringify(cache), "utf8");
    fs.renameSync(temporaryFile, cacheFile);
  } finally {
    if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
  }
}

export class TmdbClient {
  constructor({
    env = process.env,
    transport = axios.get,
    cacheFile = DEFAULT_CACHE_FILE,
    cacheTtlMs = 24 * 60 * 60 * 1000,
    cacheFlushEvery = 50,
    timeoutMs = 15_000,
    retries = 3,
    baseDelayMs = 500,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = {}) {
    this.token = requireToken(env);
    this.transport = transport;
    this.cacheFile = cacheFile;
    this.cacheTtlMs = cacheTtlMs;
    this.cacheFlushEvery = cacheFlushEvery;
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.baseDelayMs = baseDelayMs;
    this.now = now;
    this.sleep = sleep;
    this.cache = readCache(cacheFile);
    this.pendingCacheWrites = 0;
  }

  flushCache() {
    if (this.pendingCacheWrites === 0) return;
    writeCache(this.cacheFile, this.cache);
    this.pendingCacheWrites = 0;
  }

  async request(endpoint, params = {}, { refresh = false, validate = null } = {}) {
    const stableParams = Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
    const cacheKey = `${endpoint}?${new URLSearchParams(stableParams).toString()}`;
    const cached = this.cache[cacheKey];
    if (!refresh && cached && this.now() - cached.savedAt < this.cacheTtlMs) {
      if (validate) validate(cached.data);
      return cached.data;
    }

    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await this.transport(`${API_BASE}${endpoint}`, {
          headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
          params: stableParams,
          timeout: this.timeoutMs
        });
        const data = response?.data ?? response;
        if (validate) {
          try {
            validate(data);
          } catch (error) {
            error.retryable = false;
            throw error;
          }
        }
        this.cache[cacheKey] = { savedAt: this.now(), data };
        this.pendingCacheWrites += 1;
        if (this.pendingCacheWrites >= this.cacheFlushEvery) this.flushCache();
        return data;
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === this.retries) break;
        await this.sleep(this.baseDelayMs * (2 ** attempt));
      }
    }
    throw lastError;
  }

  async discoverMonth({ startDate, endDate, originCountries, refresh = false }) {
    const results = [];
    let page = 1;
    let totalPages = 1;
    do {
      const data = await this.request("/discover/tv", {
        "first_air_date.gte": startDate,
        "first_air_date.lte": endDate,
        include_adult: "false",
        page: String(page),
        sort_by: "first_air_date.asc",
        with_origin_country: originCountries.join("|")
      }, { refresh, validate: (value) => {
        if (!Array.isArray(value?.results) || !Number.isInteger(value?.total_pages)) {
          throw new Error("TMDb discover 回應缺少 results 或 total_pages。");
        }
      } });
      results.push(...data.results);
      totalPages = Math.min(data.total_pages, 500);
      page += 1;
    } while (page <= totalPages);
    return results;
  }

  async getCandidate(discoverItem, { refresh = false } = {}) {
    if (!Number.isInteger(discoverItem?.id)) throw new Error("TMDb 候選缺少整數 id。");
    const [details, translationData, externalIds] = await Promise.all([
      this.request(`/tv/${discoverItem.id}`, {}, { refresh, validate: (value) => {
        if (!value || value.id == null) throw new Error(`TMDb details 缺少 id：${discoverItem.id}`);
      } }),
      this.request(`/tv/${discoverItem.id}/translations`, {}, { refresh, validate: (value) => {
        if (!Array.isArray(value?.translations)) throw new Error(`TMDb translations 缺少 translations：${discoverItem.id}`);
      } }),
      this.request(`/tv/${discoverItem.id}/external_ids`, {}, { refresh, validate: (value) => {
        if (!value || typeof value !== "object") throw new Error(`TMDb external IDs 回應無效：${discoverItem.id}`);
      } })
    ]);
    return normalizeShowCandidate(discoverItem, details, translationData?.translations ?? [], externalIds);
  }

  async getWatchProviders(tmdbId, { refresh = false } = {}) {
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new Error("TMDb 劇集缺少正整數 id。 ");
    return this.request(`/tv/${tmdbId}/watch/providers`, {}, { refresh, validate: (value) => {
      if (!value || typeof value !== "object" || !value.results || typeof value.results !== "object") {
        throw new Error(`TMDb 串流供應商回應無效：${tmdbId}`);
      }
    } });
  }
}

export { requireToken };
