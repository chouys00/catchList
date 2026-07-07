import axios from 'axios';
import { JIKAN_BASE, JIKAN_REQUEST_DELAY_MS, MAX_RETRIES } from './constants.js';

export async function getSeasonAnime(year, season) {
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
        const { data } = await axios.get(url, {
          params: { page, limit: 25 },
        });
        results.push(...data.data);
        hasNextPage = data.pagination?.has_next_page ?? false;
        success = true;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`   ⚠️ 第 ${page} 頁取得失敗 (嘗試 ${attempt + 1}/${MAX_RETRIES + 1}): ${err.message}`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    }

    if (!success) throw lastErr;
    page++;

    if (hasNextPage) {
      await new Promise((r) => setTimeout(r, JIKAN_REQUEST_DELAY_MS));
    }
  }

  return results;
}

export async function getSeasonAnimeFromAniList(year, season) {
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
        const response = await axios.post('https://graphql.anilist.co', {
          query,
          variables: { year, season: alSeason, page }
        });
        const pageData = response.data.data.Page;
        results.push(...pageData.media);
        hasNext = pageData.pageInfo.hasNextPage;
        success = true;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`   [AniList Fallback] 第 ${page} 頁獲取失敗 (${attempt + 1}/${MAX_RETRIES + 1}): ${err.message}`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    }
    if (!success) throw lastErr;
    page++;
    await new Promise((r) => setTimeout(r, 500));
  }

  // 篩選 averageScore >= 70
  const candidates = results.filter(m => m.idMal && (m.averageScore == null || m.averageScore >= 70));
  console.log(`   [AniList Fallback] 找到 ${results.length} 部動畫，初步篩選出 ${candidates.length} 部評分較高的動畫，開始獲取 Jikan 詳細評分...`);

  const enrichedAnime = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const idMal = candidate.idMal;
    const title = candidate.title.native || candidate.title.romaji || candidate.title.english;

    process.stdout.write(`\r   → [${i + 1}/${candidates.length}] 獲取 MAL 評分：${title.slice(0, 30).padEnd(30)}`);

    let success = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const jikanRes = await axios.get(`${JIKAN_BASE}/anime/${idMal}`);
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
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    await new Promise((r) => setTimeout(r, 700));
  }

  process.stdout.write('\r' + ' '.repeat(80) + '\r');
  console.log(`   [AniList Fallback] 成功獲取 ${enrichedAnime.length} 部動畫的 Jikan 評分資訊`);
  return enrichedAnime;
}
