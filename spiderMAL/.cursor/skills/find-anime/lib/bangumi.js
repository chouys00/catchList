import axios from 'axios';
import * as OpenCC from 'opencc-js';
import { BANGUMI_BASE, BANGUMI_REQUEST_DELAY_MS, BANGUMI_CONCURRENCY, MAX_RETRIES } from './constants.js';

export const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });

export async function searchBangumi(rawTitle) {
  const encoded = encodeURIComponent(rawTitle);
  const url = `${BANGUMI_BASE}/search/subject/${encoded}`;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await axios.get(url, { params: { type: 2 } });
      return data?.list ?? data?.results ?? [];
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

export function pickBestMatch(rawTitle, results) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const candidates = results.filter((item) => item.name_cn && String(item.name_cn).trim().length > 0);
  const list = candidates.length > 0 ? candidates : results;

  const normalize = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
  const target = normalize(rawTitle);

  const exact = list.find(
    (item) => normalize(item.name) === target || normalize(item.name_cn) === target,
  );
  if (exact) return exact;

  const sorted = [...list].sort((a, b) => {
    const sa = typeof a.score === 'number' ? a.score : -1;
    const sb = typeof b.score === 'number' ? b.score : -1;
    if (sa !== sb) return sb - sa;
    const ra = typeof a.rank === 'number' ? a.rank : Number.MAX_SAFE_INTEGER;
    const rb = typeof b.rank === 'number' ? b.rank : Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });

  return sorted[0] ?? null;
}

export async function enrichWithCN(animeList, onProgress) {
  if (!animeList || animeList.length === 0) return [];
  const results = new Array(animeList.length);
  let index = 0;

  async function worker() {
    while (index < animeList.length) {
      const i = index++;
      const anime = animeList[i];
      const rawTitle = anime.title_japanese || anime.title;
      onProgress?.(i + 1, animeList.length, rawTitle);
      try {
        const hits = await searchBangumi(rawTitle);
        const best = pickBestMatch(rawTitle, hits);
        const rawNameCn = best?.name_cn?.trim() || null;
        results[i] = { ...anime, title_cn: rawNameCn ? toTraditional(rawNameCn) : null };
      } catch {
        results[i] = { ...anime, title_cn: null };
      }
      if (index < animeList.length) {
        await new Promise((r) => setTimeout(r, BANGUMI_REQUEST_DELAY_MS));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(BANGUMI_CONCURRENCY, animeList.length) }, worker));
  return results;
}
