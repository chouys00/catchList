import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadExistingSections, updateReport } from '../writer.js';

test('初始化頁首不影響第一個月份，新增與重複寫入保留原區段', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'steam-initialized-writer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = path.join(dir, '遊戲.md');
  const first = '2015  1月  (更新時間: 2026-09-10)\n\n- **舊遊戲**\n  https://store.steampowered.com/app/123';
  fs.writeFileSync(report, '# Steam 歷史初始化預覽\n\n' + first + '\n------------------------------\n');
  assert.equal(loadExistingSections(report).get('2015-01'), first);
  const next = [{ year: 2026, month: 2, games: [] }];
  updateReport(next, report);
  const once = fs.readFileSync(report, 'utf8');
  updateReport(next, report);
  assert.equal(fs.readFileSync(report, 'utf8'), once);
  assert.equal(loadExistingSections(report).get('2015-01'), first);
  assert.deepEqual([...loadExistingSections(report).keys()], ['2026-02', '2015-01']);
});
