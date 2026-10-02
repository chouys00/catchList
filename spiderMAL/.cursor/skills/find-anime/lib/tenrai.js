import axios from 'axios';
import { TENRAI_BASE, TENRAI_REQUEST_DELAY_MS, MAX_RETRIES, REQUEST_TIMEOUT_MS, SEASONS, DEFAULT_MIN_SCORE } from './constants.js';
import { getRetryDelayMs } from '@catchlist/core/http.js';

// 季度回應也會包含仍在播出的舊作；只收錄本季首播，避免跨季重複。
export function selectSeasonAnime(items, year, season, minScore = DEFAULT_MIN_SCORE) {
  return items.filter(anime => {
    if (typeof anime.score !== 'number' || anime.score < minScore) return false;
    let startYear = anime.year, startSeason = anime.season;
    if (!Number.isInteger(startYear) || !SEASONS.includes(startSeason)) {
      const date = anime.aired?.from?.match(/^(\d{4})-(\d{2})-\d{2}/);
      const month = Number(date?.[2]);
      if (!date || month < 1 || month > 12) throw Error(`Tenrai 作品 ${anime.mal_id} 缺少開播季度，停止本季更新`);
      startYear = Number(date[1]); startSeason = SEASONS[Math.floor((month - 1) / 3)];
    }
    return startYear === year && startSeason === season;
  }).sort((a, b) => b.score - a.score);
}

export async function getSeasonAnime(year, season, {
  get = axios.get, wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const results = [];
  let page = 1;
  let expectedTotal;
  console.log(`\n📺 正在從 Tenrai 搜尋 ${year} ${season.toUpperCase()} 季動畫...`);
  while (true) {
    console.log(`（取得第 ${page} 頁...）`);
    let body;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await get(`${TENRAI_BASE}/seasons/${year}/${season}`, {
          params: { page, limit: 25 }, timeout: REQUEST_TIMEOUT_MS,
        });
        body = response.data;
        break;
      } catch (error) {
        const status = error.response?.status;
        if (attempt === MAX_RETRIES || (status && status !== 429 && status < 500)) throw error;
        console.warn(`   ⚠️ Tenrai 第 ${page} 頁取得失敗 (${status ?? error.message})，稍後重試`);
        await wait(getRetryDelayMs({ status, attempt, baseDelay: 1500,
          retryAfter: error.response?.headers?.['retry-after'] }));
      }
    }
    const pagination = body?.pagination;
    if (!Array.isArray(body?.data) || typeof pagination?.has_next_page !== 'boolean'
      || pagination.current_page !== page || !Number.isInteger(pagination.last_visible_page)
      || pagination.last_visible_page < page
      || pagination.has_next_page !== (page < pagination.last_visible_page)) {
      throw Error(`Tenrai 第 ${page} 頁分頁資料不完整，停止本季更新`);
    }
    if (pagination.has_next_page && body.data.length === 0) throw Error('Tenrai 回傳空白中間頁，停止本季更新');
    const total = pagination.items?.total;
    if (Number.isInteger(total)) {
      if (expectedTotal !== undefined && total !== expectedTotal) throw Error('Tenrai 分頁總數改變，請重新抓取完整季度');
      expectedTotal = total;
    }
    for (const anime of body.data) {
      if (!Number.isSafeInteger(anime?.mal_id) || anime.mal_id < 1
        || typeof anime.title !== 'string' || !anime.title.trim()
        || !(anime.score === null || (Number.isFinite(anime.score) && anime.score >= 0 && anime.score <= 10))) {
        throw Error(`Tenrai 第 ${page} 頁作品編號、名稱或評分不完整，停止本季更新`);
      }
    }
    results.push(...body.data);
    if (!pagination.has_next_page) break;
    page++;
    await wait(TENRAI_REQUEST_DELAY_MS);
  }
  if (expectedTotal !== undefined && results.length !== expectedTotal) throw Error('Tenrai 實際取得筆數與分頁總數不符，停止本季更新');
  return [...new Map(results.map(anime => [anime.mal_id, anime])).values()];
}
