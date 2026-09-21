import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as lib from '../src/library.js';
import { addManualRecord } from '../src/manual-games.js';
import { filterAndSortGames, createGameQuery } from '../src/renderer/game-browser.js';
import { updateReport } from '../../steam_discovery/writer.js';

test('舊隱藏只讀相容、三種原因、切換、復原與候補收藏', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'classification-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(new URL('../test-data/steam-tags-2026-02/遊戲.md', import.meta.url), path.join(dir, '遊戲.md'));
  const game = lib.loadLibrary(dir, 'games').entries[0];
  lib.setFavorite(dir, 'games', game.id, true);
  const old = { hideKey: game.hideKey, media: 'games', title: game.title, hiddenAt: '2020-01-01' };
  const file = path.join(dir, lib.HIDDEN_ENTRIES_FILE);
  const raw = JSON.stringify({ version: 1, entries: [old] }); fs.writeFileSync(file, raw);
  assert.equal(lib.loadHiddenEntries(dir)[0].reason, 'played');
  assert.equal(fs.readFileSync(file, 'utf8'), raw);
  const change = lib.setHiddenReason(dir, game.hideKey, 'backlog');
  lib.undoHiddenReason(dir, change);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).entries[0].reason, undefined);
  for (const reason of ['not_interested', 'backlog', 'played']) {
    lib.setHiddenReason(dir, game.hideKey, reason);
    const record = lib.loadHiddenEntries(dir)[0];
    assert.equal(record.reason, reason); assert.equal(record.hiddenAt, old.hiddenAt);
    assert.equal(record.hideKey, old.hideKey);
  }
  assert.throws(() => lib.setHiddenReason(dir, game.hideKey, 'bad'));
  lib.restoreHiddenEntry(dir, game.hideKey);
  assert.equal(lib.loadLibrary(dir, 'games').entries[0].favorite, true);
  for (const reason of ['not_interested', 'backlog', 'played']) {
    const operation = lib.hideEntry(dir, 'games', game.id, reason);
    assert.equal(lib.loadHiddenEntries(dir)[0].reason, reason);
    lib.undoHide(dir, operation);
  }
  lib.hideEntry(dir, 'games', game.id, 'backlog');
  lib.favoriteBacklogEntry(dir, game.id);
  assert.equal(lib.loadHiddenEntries(dir).length, 0);
  assert.equal(lib.loadLibrary(dir, 'games').entries[0].favorite, true);
  lib.hideEntry(dir, 'games', game.id, 'played'); lib.deleteEntry(dir, 'games', game.id);
  assert.equal(lib.loadHiddenEntries(dir)[0].available, false);
  lib.restoreHiddenEntry(dir, game.hideKey);
  assert.ok(!lib.loadLibrary(dir, 'games').entries.some(e => e.id === game.id));
});

test('好評率含下限、不含上限、無評分及無效區間與查詢快取', () => {
  const entries = [null, 89, 90, 94, 95, 100].map((score, i) => ({ id: i, score }));
  const scores = f => filterAndSortGames(entries, f).map(e => e.score).sort((a,b) => a-b);
  assert.deepEqual(scores({ min: '90', max: '95' }), [90, 94]);
  assert.deepEqual(scores({ max: '90' }), [89]);
  assert.equal(scores({}).length, 6);
  assert.equal(scores({ min: '95', max: '90' }).length, 6);
  assert.equal(scores({ min: '95', max: '95' }).length, 6);
  assert.deepEqual(scores({ min: '97' }), [100]);
  const query = createGameQuery();
  assert.equal(query(entries, { min: '90' }).length, 4);
  assert.equal(query(entries, { min: '90', max: '95' }).length, 2);
});

test('每月寫入與手動合併保留分類收藏，重複更新不重複', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'classification-monthly-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const manual = { appid: '123', title: '手動遊戲', score: 90, reviews: 10, releaseDate: null, releaseLabel: '未定', tags: [], genres: [], chineseSupport: 'unknown', addedAt: '2026-01-01', fetchedAt: '2026-01-01' };
  addManualRecord(dir, manual, null);
  const game = lib.loadLibrary(dir, 'games').entries[0];
  lib.setFavorite(dir, 'games', game.id, true); lib.hideEntry(dir, 'games', game.id, 'backlog');
  const before = fs.readFileSync(path.join(dir, lib.HIDDEN_ENTRIES_FILE), 'utf8');
  const favorite = fs.readFileSync(path.join(dir, lib.FAVORITES_FILE), 'utf8');
  const data = [{ year: 2026, month: 2, games: ['123', '456'].map(appid => ({ appid, englishName: 'Monthly ' + appid, totalReviews: 1000, reviewScore: 9, positivePct: 94, releaseDate: '2026-02-01', genres: [], communityTags: [] })) }];
  updateReport(data, path.join(dir, '遊戲.md'));
  updateReport(data, path.join(dir, '遊戲.md'));
  assert.equal(lib.loadLibrary(dir, 'games').entries.length, 1);
  assert.equal(lib.loadLibrary(dir, 'games').entries[0].appid, '456');
  assert.equal(lib.loadHiddenEntries(dir)[0].reason, 'backlog');
  assert.equal(fs.readFileSync(path.join(dir, lib.HIDDEN_ENTRIES_FILE), 'utf8'), before);
  assert.equal(fs.readFileSync(path.join(dir, lib.FAVORITES_FILE), 'utf8'), favorite);
  lib.restoreHiddenEntry(dir, game.hideKey);
  const merged = lib.loadLibrary(dir, 'games').entries;
  assert.equal(merged.length, 2);
  assert.ok(merged.find(e => e.appid === '123').favorite);
  assert.ok(merged.find(e => e.appid === '123').manualAdded);
});
