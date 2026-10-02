import test from 'node:test';
import assert from 'node:assert/strict';
import { getSeasonAnime, selectSeasonAnime } from '../.cursor/skills/find-anime/lib/tenrai.js';

const anime = id => ({ mal_id: id, title: `作品 ${id}`, score: 8.1 });
const page = (number, last, data, total) => ({ data: { data, pagination: {
  current_page: number, last_visible_page: last, has_next_page: number < last, items: { total },
} } });

test('季度只收當季首播，電影以日期判斷；未知開播資訊不能靜默寫入', () => {
  const current = { ...anime(1), year: 2026, season: 'summer' };
  const continuing = { ...anime(2), year: 2026, season: 'winter' };
  const movie = { ...anime(3), aired: { from: '2026-08-01T00:00:00+00:00' } };
  const low = { ...anime(4), score: 7.5 };
  assert.deepEqual(selectSeasonAnime([current, continuing, movie, low], 2026, 'summer').map(a => a.mal_id), [1, 3]);
  assert.throws(() => selectSeasonAnime([anime(5)], 2026, 'summer'), /缺少開播季度/);
});

test('Tenrai 完整分頁及作品編號去重，保留 MAL 評分人數與媒體欄位', async () => {
  const calls = [], waits = [];
  const first = { ...anime(1), scored_by: 1200, images: { jpg: { image_url: 'https://cdn.myanimelist.net/1.jpg' } }, trailer: { url: 'https://www.youtube.com/watch?v=N5nNKAVB4O4' } };
  const rows = await getSeasonAnime(2026, 'summer', { get: async (url, options) => {
    assert.equal(url, 'https://api.tenrai.org/v1/seasons/2026/summer');
    assert.equal(options.timeout, 15000); calls.push(options.params.page);
    return options.params.page === 1 ? page(1, 2, [first], 3) : page(2, 2, [first, anime(2)], 3);
  }, wait: async ms => waits.push(ms) });
  assert.deepEqual(calls, [1, 2]); assert.deepEqual(waits, [1100]);
  assert.deepEqual(rows.map(a => a.mal_id), [1, 2]); assert.equal(rows[0].scored_by, 1200);
  assert.ok(rows[0].images.jpg.image_url); assert.ok(rows[0].trailer.url);
});

test('後續頁失敗、分頁缺漏、總數不符與無效作品均拒絕回傳殘缺季度', async () => {
  const invalid = [
    { data: { data: [anime(1)] } }, page(1, 2, [], 1),
    page(1, 1, [anime(1)], 2), page(1, 1, [{ ...anime(1), mal_id: null }], 1),
    page(1, 1, [{ ...anime(1), score: '8.1' }], 1),
  ];
  for (const response of invalid) await assert.rejects(getSeasonAnime(2026, 'summer', { get: async () => response, wait: async () => {} }));
  let failures = 0;
  await assert.rejects(getSeasonAnime(2026, 'summer', { get: async (_url, options) => {
    if (options.params.page === 1) return page(1, 2, [anime(1)], 2);
    failures++; throw Error('第二頁失敗');
  }, wait: async () => {} }), /第二頁失敗/);
  assert.equal(failures, 3);
});

test('限流遵守 Retry-After，無效請求不重試', async () => {
  let calls = 0; const waits = [];
  await getSeasonAnime(2026, 'summer', { get: async () => {
    if (++calls === 1) throw Object.assign(Error('limited'), { response: { status: 429, headers: { 'retry-after': '4' } } });
    return page(1, 1, [anime(1)], 1);
  }, wait: async ms => waits.push(ms) });
  assert.deepEqual(waits, [4000]);
  calls = 0;
  await assert.rejects(getSeasonAnime(2026, 'summer', { get: async () => {
    calls++; throw Object.assign(Error('bad request'), { response: { status: 400 } });
  }, wait: async () => {} }), /bad request/);
  assert.equal(calls, 1);
});
