import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveAnimeBatch } from '../.cursor/skills/find-anime/lib/writer.js';
import { pickBestMatch } from '../.cursor/skills/find-anime/lib/bangumi.js';
import { readAnimeSources, animeSourceKey } from '../../packages/core/anime-sources.js';
import { sourceEntries } from '../../catchlist_reader/src/library.js';
import { AnimeMediaService } from '../../catchlist_reader/src/anime-media.js';

test('抓取資料寫入後，閱讀器沿用來源且不重新搜尋；原清單保持相容', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-source-'));
  try {
    const report = path.join(dir, '動畫.md');
    const batch = { year: 2025, season: 'spring', minScore: 7.7, items: [{ mal_id: 59636, title: 'Uma Musume', title_japanese: 'ウマ娘', title_cn: '賽馬娘 &amp; 測試', score: 8.5, episodes: 13, type: 'TV', images: { jpg: { large_image_url: 'https://cdn.myanimelist.net/a.jpg' } }, trailer: { url: 'https://www.youtube.com/watch?v=N5nNKAVB4O4' } }] };
    saveAnimeBatch(report, batch);
    const entry = sourceEntries(dir, 'anime').entries[0];
    const sourceRecord = readAnimeSources(dir).records[animeSourceKey(entry)];
    assert.equal(sourceRecord.malId, 59636);
    const service = new AnimeMediaService(path.join(dir, 'cache.json'), { fetchImpl: async () => { throw Error('不應查網路'); } });
    service.records[animeSourceKey(entry)] = { status: 'unmatched', savedAt: Date.now() };
    const result = await service.resolve({ ...entry, sourceRecord });
    assert.equal(result.status, 'ready'); assert.equal(result.malId, 59636);
    assert.equal(result.coverUrl, 'https://cdn.myanimelist.net/a.jpg'); assert.ok(result.trailerUrl);
    const before = fs.readFileSync(report);
    assert.throws(() => saveAnimeBatch(report, {...batch, items:[{name_cn:'舊暫存'}]}), /缺少有效來源/);
    assert.deepEqual(fs.readFileSync(report), before);
    fs.writeFileSync(path.join(dir, '.catchlist-anime-sources.json'), '{broken');
    assert.throws(() => saveAnimeBatch(report, batch));
    assert.equal(fs.readFileSync(path.join(dir, '.catchlist-anime-sources.json'), 'utf8'), '{broken');
    assert.deepEqual(fs.readFileSync(report), before);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

test('中文名不能只因搜尋排名高就替換成別部作品', () => {
  assert.equal(pickBestMatch('原作品', [{name:'其他作品',name_cn:'其他中文名',score:9}]), null);
  assert.equal(pickBestMatch('原作品', [{id:1,name:'原作品',name_cn:'中文名'},{id:2,name:'其他作品',name_cn:'其他中文名',score:10}]).id,1);
  assert.equal(pickBestMatch('原作品', [{name:'原作品',name_cn:'版本一'},{name:'原作品',name_cn:'版本二'}]), null);
});
