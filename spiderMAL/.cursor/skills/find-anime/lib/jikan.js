import axios from 'axios';
import { JIKAN_BASE, JIKAN_REQUEST_DELAY_MS, MAX_RETRIES, REQUEST_TIMEOUT_MS } from './constants.js';

export async function getSeasonAnime(year, season, { get = axios.get, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const results = [];
  let page = 1;
  let hasNextPage = true;

  console.log(`\n📺 正在搜尋 ${year} ${season.toUpperCase()} 季動畫...`);

  while (hasNextPage) {
    console.log(`（取得第 ${page} 頁...）`);
    const url = `${JIKAN_BASE}/seasons/${year}/${season}`;
    let lastErr;
    let success = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { data } = await get(url, {
          params: { page, limit: 25 },
          timeout: REQUEST_TIMEOUT_MS,
        });
        results.push(...data.data);
        hasNextPage = data.pagination?.has_next_page ?? false;
        success = true;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`   ⚠️ 第 ${page} 頁取得失敗 (嘗試 ${attempt + 1}/${MAX_RETRIES + 1}): ${err.message}`);
        if (attempt < MAX_RETRIES) {
          await wait(1500 * (attempt + 1));
        }
      }
    }

    if (!success) throw lastErr;
    page++;

    if (hasNextPage) {
      await wait(JIKAN_REQUEST_DELAY_MS);
    }
  }

  return results;
}

export async function getSeasonAnimeFromAniList(year, season, { get = axios.get, post = axios.post, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const query = `
    query ($year: Int, $season: MediaSeason, $page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo {
          hasNextPage
        }
        media(season: $season, seasonYear: $year, type: ANIME) {
          idMal
          title {
            romaji
            english
            native
          }
          episodes
          format
          averageScore
        }
      }
    }
  `;

  const alSeason = season.toUpperCase();
  const results = [];
  let page = 1;
  let hasNext = true;

  console.log(`   [AniList Fallback] 正在從 AniList 獲取 ${year} ${alSeason} 季動畫列表...`);

  while (hasNext) {
    let lastErr;
    let success = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await post('https://graphql.anilist.co', {
          query,
          variables: { year, season: alSeason, page }
        }, { timeout: REQUEST_TIMEOUT_MS });
        const pageData = response.data.data.Page;
        results.push(...pageData.media);
        hasNext = pageData.pageInfo.hasNextPage;
        success = true;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`   [AniList Fallback] 第 ${page} 頁獲取失敗 (${attempt + 1}/${MAX_RETRIES + 1}): ${err.message}`);
        if (attempt < MAX_RETRIES) {
          await wait(1500 * (attempt + 1));
        }
      }
    }
    if (!success) throw lastErr;
    page++;
    await wait(500);
  }

  // 篩選 averageScore >= 70
  const candidates = results.filter(m => m.idMal && (m.averageScore == null || m.averageScore >= 70));
  console.log(`   [AniList Fallback] 找到 ${results.length} 部動畫，初步篩選出 ${candidates.length} 部評分較高的動畫，開始獲取 Jikan 詳細評分...`);

  const enrichedAnime = [];
  let failCount = 0;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const idMal = candidate.idMal;
    const title = candidate.title.native || candidate.title.romaji || candidate.title.english;

    process.stdout.write(`\r   → [${i + 1}/${candidates.length}] 獲取 MAL 評分：${title.slice(0, 30).padEnd(30)}`);

    let success = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const jikanRes = await get(`${JIKAN_BASE}/anime/${idMal}`, { timeout: REQUEST_TIMEOUT_MS });
        const animeData = jikanRes.data.data;
        if (animeData) {
          enrichedAnime.push({
            title: animeData.title,
            title_japanese: animeData.title_japanese,
            score: animeData.score,
            episodes: animeData.episodes,
            type: animeData.type
          });
        }
        success = true;
        break;
      } catch (err) {
        if (err.response?.status === 404) {
          success = true;
          break;
        }
        if (attempt < MAX_RETRIES) {
          await wait(1000 * (attempt + 1));
        }
      }
    }
    if (!success) failCount++;
    await wait(700);
  }

  process.stdout.write('\r' + ' '.repeat(80) + '\r');
  console.log(`   [AniList Fallback] 成功獲取 ${enrichedAnime.length} 部動畫的 Jikan 評分資訊(查詢失敗 ${failCount} 部)`);

  // 若個別查詢失敗過多(Jikan 大範圍故障),放棄本季不寫入。
  // 否則殘缺清單會被標記為「已完成」,缺漏的動畫永遠不會補回來;
  // 拋錯讓 update.js 以非零 exit code 結束,下次排程執行自動重試。
  if (failCount > Math.ceil(candidates.length * 0.2)) {
    throw new Error(
      `AniList 備援中 Jikan 個別查詢失敗過多 (${failCount}/${candidates.length}),放棄本季以免寫入不完整清單`
    );
  }

  return enrichedAnime;
}
