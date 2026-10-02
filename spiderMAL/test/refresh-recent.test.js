import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { missingAnime } from '../refresh-recent.js';
import { appendAnimeBatch } from '../.cursor/skills/find-anime/lib/writer.js';
import { readAnimeSources, animeSourceKey } from '../../packages/core/anime-sources.js';
import { parseReport } from '../../catchlist_reader/src/library.js';

test('回補依 MAL 編號辨識，既有名稱不同或同作品重複列都不重加', () => {
  const entries = [{ title: '使用者名稱', sectionKey: '2026-冬' }, { title: '舊名稱', sectionKey: '2026-冬' }];
  const records = Object.fromEntries(entries.map(e => [animeSourceKey(e), { malId: 1 }]));
  assert.deepEqual(missingAnime([{ mal_id: 1 }, { mal_id: 2 }], entries, records, '2026-冬'), [{ mal_id: 2 }]);
  assert.throws(() => missingAnime([], entries, {}, '2026-冬'), /缺少核對過/);
});

test('回補保留既有季度標題、列與下方歷史，來源保存後可再次去重', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-refresh-'));
  try {
    const file = path.join(dir, '動畫.md');
    const header = '2026  冬  >7.70    (更新時間: 2026-06-27 09:07)\r\n';
    const original = header + '\r\n- 使用者名稱  **8.00**  (12 · TV)\r\n------------------------------\r\n\r\n2012  冬  >8.15\r\n- 歷史作品 **8.30**\r\n------------------------------\r\n';
    fs.writeFileSync(file, original);
    const item = { mal_id: 2, title: 'New', title_japanese: '新作品', score: 8.2, episodes: 12, type: 'TV' };
    appendAnimeBatch(file, { year: 2026, season: 'winter', minScore: 7.7, items: [item] });
    const after = fs.readFileSync(file, 'utf8');
    assert.ok(after.startsWith(header)); assert.ok(after.includes('- 使用者名稱  **8.00**  (12 · TV)\r\n'));
    assert.ok(after.endsWith(original.slice(original.indexOf('2012  冬'))));
    assert.equal((after.match(/2026  冬/g) ?? []).length, 1);
    const added = parseReport('anime', after).entries.find(e => e.title === '新作品');
    assert.equal(readAnimeSources(dir).records[animeSourceKey(added)].malId, 2);
    fs.writeFileSync(file, '2026 冬 >7.7\n未結束區段\n2026 春 >7.7\n------------------------------');
    const before = fs.readFileSync(file, 'utf8');
    assert.throws(() => appendAnimeBatch(file, { year: 2026, season: 'winter', minScore: 7.7, items: [item] }), /分隔線/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
