import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SEASONS, ZH_TO_EN, DEFAULT_MIN_SCORE, TARGET_PATH } from '../lib/constants.js';
import { getSeasonAnime, getSeasonAnimeFromAniList } from '../lib/jikan.js';
import { enrichWithCN } from '../lib/bangumi.js';
import { buildBatchText, saveStacked } from '../lib/writer.js';

function monthToSeasonIndex(month) {
  if (month >= 1 && month <= 3) return 0;
  if (month >= 4 && month <= 6) return 1;
  if (month >= 7 && month <= 9) return 2;
  return 3;
}

function getPreviousSeason(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const currentIdx = monthToSeasonIndex(month);

  if (currentIdx === 0) {
    return { year: year - 1, season: 'fall' };
  }
  return { year, season: SEASONS[currentIdx - 1] };
}

function parseLatestSeason(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).slice(0, 5);

  const re = /^(\d{4})\s+(冬|春|夏|秋)\s+>/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      return { year: Number(m[1]), season: ZH_TO_EN[m[2]] };
    }
  }
  return null;
}

function seasonOrd(year, season) {
  return year * 4 + SEASONS.indexOf(season);
}

function getSeasonRange(startYear, startSeason, endYear, endSeason) {
  const startOrd = seasonOrd(startYear, startSeason);
  const endOrd = seasonOrd(endYear, endSeason);
  const result = [];

  for (let ord = startOrd + 1; ord <= endOrd; ord++) {
    const y = Math.floor(ord / 4);
    const s = SEASONS[((ord % 4) + 4) % 4];
    result.push({ year: y, season: s });
  }

  return result;
}

async function main() {
  const now = new Date();
  const prev = getPreviousSeason(now);
  console.log(`\n🕐 當前時間：${now.toISOString().slice(0, 10)}`);
  console.log(`📅 上一季：${prev.year} ${prev.season}`);

  const latest = parseLatestSeason(TARGET_PATH);
  if (latest) {
    console.log(`📄 動畫.md 最新一季：${latest.year} ${latest.season}`);
  } else {
    console.log(`📄 動畫.md 不存在或無法解析，將從上一季開始寫入`);
  }

  // Determine which seasons to fetch
  let seasonsToFetch;
  if (!latest) {
    seasonsToFetch = [prev];
  } else {
    if (seasonOrd(latest.year, latest.season) >= seasonOrd(prev.year, prev.season)) {
      console.log(`\n✅ 動畫.md 已是最新（${latest.year} ${latest.season}），不需更新。`);
      return;
    }
    seasonsToFetch = getSeasonRange(latest.year, latest.season, prev.year, prev.season);
  }

  if (seasonsToFetch.length === 0) {
    console.log(`\n✅ 沒有需要補齊的季度。`);
    return;
  }

  console.log(`\n📋 需要補齊 ${seasonsToFetch.length} 個季度：`);
  seasonsToFetch.forEach((s) => console.log(`   → ${s.year} ${s.season}`));

  // Fetch and write each season (oldest first so stacking puts newest on top)
  for (const { year, season } of seasonsToFetch) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`🔍 正在搜尋 ${year} ${season}...`);

    try {
      // 1. Fetch from Jikan API
      let animeList;
      try {
        animeList = await getSeasonAnime(year, season);
      } catch (err) {
        console.warn(`   ⚠️ Jikan 官方季度 API 獲取失敗 (${err.message || err})，正在切換至 AniList 備用機制...`);
        animeList = await getSeasonAnimeFromAniList(year, season);
      }

      // 2. Sort by score descending
      animeList.sort((a, b) => {
        if (a.score == null && b.score == null) return 0;
        if (a.score == null) return 1;
        if (b.score == null) return -1;
        return b.score - a.score;
      });

      // 3. Filter by min score
      animeList = animeList.filter(
        (anime) => anime.score != null && anime.score >= DEFAULT_MIN_SCORE,
      );

      console.log(`   篩選後：${animeList.length} 部（評分 >= ${DEFAULT_MIN_SCORE}）`);

      if (animeList.length === 0) {
        console.log(`   ⚠️ 無符合條件的動畫，跳過此季`);
        continue;
      }

      // 4. Enrich with Chinese names from Bangumi
      console.log(`   查詢 Bangumi 中文名稱...`);
      const enriched = await enrichWithCN(animeList, (current, total, rawTitle) => {
        process.stdout.write(
          `\r   → [${current}/${total}] 查詢：${rawTitle.slice(0, 30).padEnd(30)}`,
        );
      });
      process.stdout.write('\r' + ' '.repeat(60) + '\r');

      // 5. Build items for batch text
      const items = enriched.map((anime) => ({
        name_cn: anime.title_cn || anime.title_japanese || anime.title || null,
        score: anime.score ?? null,
        episodes: anime.episodes ?? null,
        type: anime.type ?? null,
      }));

      // 6. Build batch text and stack into file
      const batchText = buildBatchText({
        year,
        season,
        minScore: DEFAULT_MIN_SCORE,
        items,
      });
      saveStacked(TARGET_PATH, batchText);

      console.log(`   ✅ ${year} ${season} 已寫入（${items.length} 部）`);
    } catch (err) {
      console.error(`   ❌ ${year} ${season} 處理失敗：${err.message || err}`);
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`\n✅ 全部完成！已補齊 ${seasonsToFetch.length} 個季度到：${TARGET_PATH}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\n❌ 更新失敗:', err.message || err);
    process.exit(1);
  });
}
