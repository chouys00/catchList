import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_MIN_SCORE } from '../lib/constants.js';
import { getSeasonAnime } from '../lib/jikan.js';
import { enrichWithCN } from '../lib/bangumi.js';

const COL_TITLE_WIDTH = 36;
const COL_TYPE_WIDTH = 8;
const COL_SCORE_WIDTH = 8;
const TABLE_WIDTH = 72;

function logStep(step, total, message) {
  console.log(`[${step}/${total}] ${message}`);
}

function getDisplayWidth(s) {
  let width = 0;
  for (const ch of String(s)) width += ch.codePointAt(0) > 0x7f ? 2 : 1;
  return width;
}

function pad(str, len) {
  const s = String(str);
  return s + ' '.repeat(Math.max(0, len - getDisplayWidth(s)));
}

function printAnimeList(animeList, useCn = true) {
  console.log(`共找到 ${animeList.length} 部動畫\n`);

  const header = `${'名次'.padEnd(4)} ${pad('標題', COL_TITLE_WIDTH)} ${pad('類型', COL_TYPE_WIDTH)} ${'評分'.padEnd(6)} 集數`;
  const divider = '─'.repeat(TABLE_WIDTH);

  console.log(header);
  console.log(divider);

  animeList.forEach((anime, index) => {
    const rank = String(index + 1).padStart(4);
    const chosenTitle = useCn
      ? anime.title_cn || anime.title_japanese || anime.title
      : anime.title_japanese || anime.title;
    const title = pad(chosenTitle, COL_TITLE_WIDTH);
    const type = pad(anime.type ?? '未知', COL_TYPE_WIDTH);
    const score = pad(anime.score ? `⭐ ${anime.score}` : '尚無評分', COL_SCORE_WIDTH);
    const eps = anime.episodes ? `${anime.episodes} 集` : '未定';

    console.log(`${rank} ${title} ${type} ${score} ${eps}`);
  });

  console.log(divider);
}

function saveCache({ year, season, minScore, items }) {
  try {
    const cachePath = path.resolve(process.cwd(), 'anime-cache.json');
    const payload = { year, season, minScore, items };
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`暫存檔已寫入：${cachePath}`);
  } catch (err) {
    console.warn('\n⚠️  暫存檔寫入失敗:', err.message);
  }
}

async function main() {
  const TOTAL_STEPS = 6;
  const VALID_SEASONS = ['winter', 'spring', 'summer', 'fall'];
  const args = process.argv.slice(2);

  const argYear = args[0];
  const argSeason = args[1];
  const argMinScore = args[2];

  const year = argYear && /^\d{4}$/.test(argYear) ? Number(argYear) : 2025;
  const season =
    argSeason && VALID_SEASONS.includes(argSeason.toLowerCase())
      ? argSeason.toLowerCase()
      : 'winter';
  const minScore =
    argMinScore && !isNaN(parseFloat(argMinScore))
      ? parseFloat(argMinScore)
      : DEFAULT_MIN_SCORE;

  try {
    logStep(1, TOTAL_STEPS, `解析參數：${year} ${season}，評分 >= ${minScore}\n`);

    logStep(2, TOTAL_STEPS, '正在從 Jikan 取得季節動畫...');
    let animeList = await getSeasonAnime(year, season);

    animeList.sort((a, b) => {
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return b.score - a.score;
    });

    animeList = animeList.filter((anime) => anime.score != null && anime.score >= minScore);

    logStep(3, TOTAL_STEPS, `取得 ${animeList.length} 部，依評分排序並篩選...（篩選：評分 >= ${minScore}）\n`);

    logStep(4, TOTAL_STEPS, `查詢 Bangumi 中文名稱 (${animeList.length} 部)...`);
    const enriched = await enrichWithCN(animeList, (current, total, rawTitle) => {
      process.stdout.write(`\r  → [${current}/${total}] 查詢：${rawTitle.slice(0, 30).padEnd(30)}`);
    });
    process.stdout.write('\r' + ' '.repeat(60) + '\r');

    logStep(5, TOTAL_STEPS, '輸出清單');
    printAnimeList(enriched, true);

    const items = enriched.map((anime) => ({
      name_cn: anime.title_cn || anime.title_japanese || anime.title || null,
      score: anime.score ?? null,
      episodes: anime.episodes ?? null,
      type: anime.type ?? null,
    }));

    logStep(6, TOTAL_STEPS, '寫入暫存檔');
    saveCache({ year, season, minScore, items });

    console.log('\n✓ 完成');
  } catch (err) {
    console.error('❌ 發生錯誤:', err.response?.data ?? err.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { getSeasonAnime, enrichWithCN };
