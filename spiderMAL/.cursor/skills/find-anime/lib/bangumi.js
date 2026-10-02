import axios from 'axios';
import { fileURLToPath } from 'node:url';
import { JsonJournal } from '../../../../../packages/core/json-journal.js';
import * as OpenCC from 'opencc-js';
import { BANGUMI_BASE, BANGUMI_REQUEST_DELAY_MS, BANGUMI_CONCURRENCY, MAX_RETRIES, REQUEST_TIMEOUT_MS } from './constants.js';
import { resolveChineseName, reviewedName } from './chinese-names.js';

export const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });

export async function searchBangumi(rawTitle, { get = axios.get, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const encoded = encodeURIComponent(rawTitle);
  const url = `${BANGUMI_BASE}/search/subject/${encoded}`;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await get(url, { params: { type: 2, max_results: 20 }, timeout: REQUEST_TIMEOUT_MS, headers: { 'User-Agent': 'CatchList/1.0 (anime title lookup)' } });
      return data?.list ?? data?.results ?? [];
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await wait(300 * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

export function pickBestMatch(rawTitle, results) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const candidates = results.filter((item) => item.name_cn && String(item.name_cn).trim().length > 0);
  const list = candidates.length > 0 ? candidates : results;

  const normalize = (s) => toTraditional(String(s || '')).normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu, '').toLowerCase();
  const target = normalize(rawTitle);

  const exact = list.filter(
    (item) => normalize(item.name) === target || normalize(item.name_cn) === target,
  );
  // 搜尋排名不能證明是同一部作品；無唯一原名比對就保留原文。
  return exact.length === 1 ? exact[0] : null;
}

const NAME_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let nameCache;
function defaultNameCache() {
  try { return nameCache ??= new JsonJournal(fileURLToPath(new URL('../../../../chinese-name-cache.json', import.meta.url))); }
  catch { return null; }
}

export async function enrichWithCN(animeList, onProgress, {
  cache = defaultNameCache(), search = searchBangumi, now = Date.now,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  resolveName = resolveChineseName,
} = {}) {
  if (!animeList || animeList.length === 0) return [];
  const results = new Array(animeList.length);
  let index = 0;

  async function worker() {
    while (index < animeList.length) {
      const i = index++;
      const anime = animeList[i];
      const rawTitle = anime.title_japanese || anime.title;
      onProgress?.(i + 1, animeList.length, rawTitle);
      if (Number.isSafeInteger(anime.mal_id) && anime.mal_id > 0) {
        const key = `mal:${anime.mal_id}`;
        const identity = JSON.stringify([anime.title, anime.aired?.from, anime.type, anime.episodes]);
        const cachedName = cache?.data?.[key];
        let name;
        const reviewed = reviewedName(anime);
        if (reviewed) name = { ...reviewed, method: 'reviewed' };
        else if (cachedName?.version === 3 && cachedName.identity === identity && cachedName.title && now() >= cachedName.savedAt && now() - cachedName.savedAt < NAME_CACHE_TTL_MS) name = cachedName;
        else {
          try { name = await resolveName(anime, search, { wait }); }
          catch (error) { name = { title: null, reason: error.message }; }
        }
        results[i] = { ...anime, title_cn: name.title ?? null, bangumiId: name.bangumiId ?? null, chineseNameStatus: name.title ? 'resolved' : 'pending', chineseNameSourceUrl: name.sourceUrl ?? null, chineseNameMethod: name.method ?? null, chineseNameReason: name.reason ?? null };
        if (name.title) {
          try { cache?.set(key, { ...name, version: 3, identity, savedAt: now() }); } catch { console.warn('中文名稱快取無法儲存，本次仍保留已確認名稱'); }
        }
        continue;
      }
      const cached = cache?.data?.[rawTitle];
      if (cached?.version === 2 && typeof cached.title === 'string' && cached.title.trim() && now() >= cached.savedAt && now() - cached.savedAt < NAME_CACHE_TTL_MS) {
        results[i] = { ...anime, title_cn: cached.title, bangumiId: cached.bangumiId };
        continue;
      }
      try {
        const hits = await search(rawTitle);
        const best = pickBestMatch(rawTitle, hits);
        const rawNameCn = best?.name_cn?.trim() || null;
        const title = rawNameCn ? toTraditional(rawNameCn) : null;
        results[i] = { ...anime, title_cn: title, bangumiId: best?.id ?? null };
        if (title) {
          try { cache?.set(rawTitle, { version: 2, title, bangumiId: best?.id ?? null, savedAt: now() }); }
          catch { console.warn('中文名稱快取無法儲存，本次查詢結果仍保留。'); }
        }
      } catch {
        results[i] = { ...anime, title_cn: null };
      }
      if (index < animeList.length) {
        await wait(BANGUMI_REQUEST_DELAY_MS);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(BANGUMI_CONCURRENCY, animeList.length) }, worker));
  try { cache?.flush(); } catch { console.warn('中文名稱快取尚未合併，下次可由日誌恢復。'); }
  return results;
}
