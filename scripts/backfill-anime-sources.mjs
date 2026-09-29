import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sourceEntries } from '../catchlist_reader/src/library.js';
import { readAnimeSources, saveAnimeSources, animeSourceKey } from '../packages/core/anime-sources.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = process.argv.find(arg => arg.startsWith('--data-dir='))?.slice(11);
if (!directory) throw Error('請指定 --data-dir=報告資料夾；預設只輸出預覽，--apply 才新增來源檔');
const report = path.join(directory, '動畫.md');
const before = fs.readFileSync(report);
const reviewed = JSON.parse(fs.readFileSync(path.join(root, 'docs/anime-source-repair/reviewed-sources.json'), 'utf8')).records;
const entries = sourceEntries(directory, 'anime').entries;
const keys = new Set(entries.map(animeSourceKey));
for (const record of reviewed) if (!keys.has(animeSourceKey(record))) throw Error(`報告已變更，請重新核對：${record.title}`);
const destination = process.argv.includes('--apply') ? directory : path.join(root, 'output/anime-source-repair/preview');
const existing = readAnimeSources(destination).records;
for (const record of reviewed) {
  const prior = existing[animeSourceKey(record)];
  if (prior && JSON.stringify(prior) !== JSON.stringify(record)) throw Error(`來源檔已有不同紀錄，保留原檔：${record.title}`);
}
saveAnimeSources(destination, reviewed);
if (!before.equals(fs.readFileSync(report))) throw Error('報告在執行期間被其他程序修改，請重新核對');
const mapped = entries.filter(entry => reviewed.some(r => animeSourceKey(r) === animeSourceKey(entry) && r.status !== 'needs-review'));
console.log(JSON.stringify({ destination, reportSHA256: crypto.createHash('sha256').update(before).digest('hex'), matchedRows: mapped.length, mappedIdentities: reviewed.filter(r => r.status !== 'needs-review').length, review: reviewed.filter(r => r.status === 'needs-review').map(r => ({title:r.title, reason:r.reason})), reportUnchanged: true }, null, 2));
