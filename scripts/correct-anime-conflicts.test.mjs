import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { corrections, prepareCorrection, applyCorrection, filenames } from './correct-anime-conflicts.mjs';
import { animeSourceKey, readAnimeSources } from '../packages/core/anime-sources.js';
import { sourceEntries, loadAllLibraries, loadHiddenEntries } from '../catchlist_reader/src/library.js';
import { VisitHistory } from '../catchlist_reader/src/visit-history.js';
import { AnimeMediaService } from '../catchlist_reader/src/anime-media.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-correction-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = corrections.map(f => `${f.sectionKey.replace('-', '  ')}  >7.70\r\n\r\n- ${f.oldTitle}  **8.00**  (12 · TV)\r\n------------------------------\r\n`).join('\r\n');
  fs.writeFileSync(path.join(dir, '動畫.md'), report);
  const write = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
  write('.catchlist-anime-sources.json', { version: 1, records: Object.fromEntries(corrections.map(f => {
    const r = { title: f.oldTitle, sectionKey: f.sectionKey, status: 'needs-review', reason: '衝突' };
    return [animeSourceKey(r), r];
  })) });
  const entries = sourceEntries(dir, 'anime').entries;
  write('.catchlist-favorites.json', { version: 1, entries: entries.map(e => ({ key: e.hideKey, media: 'anime', title: e.title, savedAt: '2020-01-01', extra: 7 })) });
  write('.catchlist-hidden.json', { version: 1, entries: entries.map(e => ({ hideKey: e.hideKey, media: 'anime', title: e.title, hiddenAt: '2021-01-01', reason: '已看', extra: 8 })) });
  write('.catchlist-visits.json', { version: 1, media: { anime: { keys: entries.map(e => e.hideKey), visitedAt: '2022-01-01' }, games: {keys: ['untouched'], visitedAt: '2023-01-01'} } });
  return dir;
}

test('改名保留收藏、隱藏、時間與閱讀紀錄，來源可直接使用且重跑不變', async t => {
  const dir = fixture(t), plan = prepareCorrection(dir);
  const result = applyCorrection(plan);
  for (const name of filenames) assert.deepEqual(fs.readFileSync(path.join(result.backup, name)), plan.before.get(name));
  const hidden = loadHiddenEntries(dir);
  assert.equal(hidden.length, 3);
  assert.ok(hidden.every(e => e.available && e.entry.favorite && e.hiddenAt === '2021-01-01' && e.extra === 8 && e.reason === '已看'));
  assert.equal(loadAllLibraries(dir).find(l => l.media === 'anime').entries.length, 0);
  const favorites = JSON.parse(fs.readFileSync(path.join(dir, '.catchlist-favorites.json')));
  assert.ok(favorites.entries.every(e => e.savedAt === '2020-01-01' && e.extra === 7));
  fs.writeFileSync(path.join(dir, '.catchlist-hidden.json'), JSON.stringify({version:1,entries:[]}));
  const visits = new VisitHistory().annotate(dir, loadAllLibraries(dir), 'anime');
  assert.equal(visits.visitWarning, null);
  assert.ok(visits.libraries.find(l => l.media === 'anime').entries.every(e => e.favorite && !e.isNew));
  const history = JSON.parse(fs.readFileSync(path.join(dir, '.catchlist-visits.json')));
  assert.equal(history.media.anime.visitedAt, '2022-01-01');
  assert.deepEqual(history.media.games, {keys:['untouched'],visitedAt:'2023-01-01'});
  const service = new AnimeMediaService(path.join(dir, 'media-cache.json'), { fetchImpl: () => { throw Error('不應連線'); } });
  for (const entry of sourceEntries(dir, 'anime').entries) {
    const source = readAnimeSources(dir).records[animeSourceKey(entry)];
    const media = await service.resolve({...entry,sourceRecord:source});
    assert.equal(media.status, 'ready'); assert.ok(media.coverUrl);
    assert.equal(Boolean(media.trailerUrl), source.malId !== 60279);
  }
  assert.deepEqual(prepareCorrection(dir).changed, []);
});

test('預覽後有外部修改就停止，保留外部修改與其他檔案', t => {
  const dir = fixture(t), plan = prepareCorrection(dir);
  fs.appendFileSync(path.join(dir, '.catchlist-favorites.json'), '\n');
  assert.throws(() => applyCorrection(plan), /其他程序修改/);
  assert.deepEqual(fs.readFileSync(path.join(dir, '動畫.md')), plan.before.get('動畫.md'));
});

test('新舊收藏同時存在時拒絕合併，避免個人紀錄被覆蓋', t => {
  const dir = fixture(t), plan = prepareCorrection(dir);
  const file = path.join(dir, '.catchlist-favorites.json');
  const data = JSON.parse(fs.readFileSync(file));
  data.entries.push({...data.entries[0],key:plan.mappings[0].newKey});
  fs.writeFileSync(file, JSON.stringify(data));
  assert.throws(() => prepareCorrection(dir), /個人紀錄衝突/);
});
