import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildBatchText, saveStacked, seasonToZh } from '../lib/writer.js';

function loadCache() {
  const cachePath = path.resolve(process.cwd(), 'anime-cache.json');
  if (!fs.existsSync(cachePath)) {
    throw new Error(`找不到 anime-cache.json，請先執行「找動畫」產生暫存（預期路徑：${cachePath}）`);
  }

  const raw = fs.readFileSync(cachePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('anime-cache.json 解析失敗，請確認檔案內容為正確的 JSON。');
  }

  const { year, season, minScore, items } = parsed;
  if (!year || !season || typeof minScore !== 'number' || !Array.isArray(items)) {
    throw new Error('anime-cache.json 結構不完整，缺少 year/season/minScore/items。');
  }

  return { year, season, minScore, items };
}

async function main() {
  try {
    const cache = loadCache();
    const batchText = buildBatchText(cache);

    const targetPath = 'D:/GoogleDrive_Sync/動畫.md';
    saveStacked(targetPath, batchText);

    const seasonZh = seasonToZh(cache.season);
    console.log(`\n✅ 已寫入一批動畫資料到：${targetPath}`);
    console.log(`   來源：${cache.year} ${seasonZh}季，評分門檻 > ${cache.minScore.toFixed(2)}，共 ${cache.items.length} 部`);
  } catch (err) {
    console.error('\n❌ 寫入失敗：', err.message || err);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
