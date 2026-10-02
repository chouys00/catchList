import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSeasonAnime, selectSeasonAnime } from './.cursor/skills/find-anime/lib/tenrai.js';
import { enrichWithCN } from './.cursor/skills/find-anime/lib/bangumi.js';
import { requireChineseNames } from './.cursor/skills/find-anime/lib/chinese-names.js';
import { appendAnimeBatch, seasonToZh } from './.cursor/skills/find-anime/lib/writer.js';
import { SEASONS, TARGET_PATH, DEFAULT_MIN_SCORE } from './.cursor/skills/find-anime/lib/constants.js';
import { readAnimeSources, animeSourceKey } from '../packages/core/anime-sources.js';
import { parseReport } from '../catchlist_reader/src/library.js';
import { createUpdateRecorder } from '../scripts/update-status.mjs';

export function missingAnime(items, entries, records, sectionKey) {
  const current = entries.filter(entry => entry.sectionKey === sectionKey);
  const ids = new Set();
  for (const entry of current) {
    const id = records[animeSourceKey(entry)]?.malId;
    if (!Number.isSafeInteger(id) || id < 1) throw Error(`${sectionKey} 的「${entry.title}」缺少核對過的 MAL 編號，停止自動回補`);
    ids.add(id);
  }
  return items.filter(item => !ids.has(item.mal_id));
}

async function main() {
  const args = process.argv.slice(2);
  const quarters = args.length === 0 ? 3 : args[0] === '--recent' && args.length === 2 ? Number(args[1]) : NaN;
  if (!Number.isInteger(quarters) || quarters < 1 || quarters > 4) throw Error('用法：node refresh-recent.js [--recent 1～4]');
  const directory = path.dirname(TARGET_PATH);
  const output = fileURLToPath(new URL('../output/tenrai-migration/', import.meta.url));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(output, stamp);
  fs.mkdirSync(runDir, { recursive: true });
  // 在寫入前保存原報告與來源，個人紀錄只計算雜湊，不修改。
  for (const name of ['動畫.md', '.catchlist-anime-sources.json', '.catchlist-update-status.json']) {
    const file = path.join(directory, name);
    if (fs.existsSync(file)) fs.copyFileSync(file, path.join(runDir, name));
  }
  const recorder = createUpdateRecorder();
  const project = { media: 'anime', outputFile: TARGET_PATH };
  const context = recorder.start(project);
  const results = [];
  try {
    const now = new Date();
    const end = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3) - 1;
    for (let ord = end - quarters + 1; ord <= end; ord++) {
      const year = Math.floor(ord / 4), season = SEASONS[ord % 4];
      const sectionKey = `${year}-${seasonToZh(season)}`;
      const all = await getSeasonAnime(year, season);
      const selected = selectSeasonAnime(all, year, season);
      const entries = parseReport('anime', fs.existsSync(TARGET_PATH) ? fs.readFileSync(TARGET_PATH, 'utf8') : '').entries;
      const sources = readAnimeSources(directory);
      const missing = missingAnime(selected, entries, sources.records, sectionKey);
      const result = { sectionKey, fetched: all.length, qualified: selected.length, existing: entries.filter(e => e.sectionKey === sectionKey).length, added: missing.length };
      const enriched = await enrichWithCN(missing, (i, total, title) => console.log(`中文名稱 ${i}/${total}：${title}`));
      requireChineseNames(enriched);
      // 中文顯示名與既有名稱碰撞時停下，避免覆蓋來源對照。
      const existingTitles = new Set(entries.filter(e => e.sectionKey === sectionKey).map(e => e.title));
      const titles = new Set();
      for (const item of enriched) {
        const title = item.title_cn || item.title_japanese || item.title;
        if (existingTitles.has(title) || titles.has(title)) throw Error(`${sectionKey} 中文名稱重複：${title}，停止回補`);
        titles.add(title);
      }
      fs.writeFileSync(path.join(runDir, `${year}-${season}.json`), JSON.stringify({ ...result, selected, additions: enriched }, null, 2));
      if (enriched.length) appendAnimeBatch(TARGET_PATH, { year, season, minScore: DEFAULT_MIN_SCORE, items: enriched });
      // 寫入後按 MAL 編號重新比對，不能只因程序未拋錯就視為成功。
      const after = parseReport('anime', fs.readFileSync(TARGET_PATH, 'utf8')).entries;
      if (missingAnime(selected, after, readAnimeSources(directory).records, sectionKey).length) throw Error(`${sectionKey} 寫入後仍有缺漏`);
      results.push(result);
      console.log(JSON.stringify(result));
    }
    recorder.finish(project, context, { status: 0 });
  } catch (error) {
    recorder.finish(project, context, { status: 1 });
    throw error;
  } finally {
    fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify({ finishedAt: new Date().toISOString(), results }, null, 2));
    console.log(`稽核及備份：${runDir}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
