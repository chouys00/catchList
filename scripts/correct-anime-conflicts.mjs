import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseReport } from '../catchlist_reader/src/library.js';
import { animeSourceKey, readAnimeSources } from '../packages/core/anime-sources.js';

export const corrections = [
  { oldTitle: 'MIX：明青故事 第二季 ～第二個夏天，邁向晴空～', title: '徹夜之歌 第二季', sectionKey: '2025-夏', malId: 58390, anilistId: 175914 },
  { oldTitle: '在這世界(更多一些)的角落', title: '多聞くん今どっち!?', sectionKey: '2026-冬', malId: 59047, anilistId: 178005 },
  { oldTitle: '完美世界劇場版 九劫焚天', title: '仙逆劇場版 神臨之戰', sectionKey: '2025-春', malId: 60279, anilistId: 185121 },
];
export const filenames = ['動畫.md', '.catchlist-anime-sources.json', '.catchlist-favorites.json', '.catchlist-hidden.json', '.catchlist-visits.json'];
const hash = bytes => bytes === null ? null : crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => fs.existsSync(file) ? fs.readFileSync(file) : null;
const json = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const evidence = json(fs.readFileSync(new URL('../docs/anime-source-repair/corrected-source-evidence.json', import.meta.url)));

export function prepareCorrection(directory) {
  const before = new Map(filenames.map(name => [name, read(path.join(directory, name))]));
  if (!before.get('動畫.md') || !before.get('.catchlist-anime-sources.json')) throw Error('缺少報告或來源檔');
  const after = new Map(before);
  const sources = readAnimeSources(directory);
  let report = before.get('動畫.md').toString('utf8');
  const original = parseReport('anime', report);
  if (original.integrity.issueCount) throw Error('報告格式異常，停止修正');
  const mappings = [];
  for (const fix of corrections) {
    const old = original.entries.filter(e => e.sectionKey === fix.sectionKey && e.title === fix.oldTitle);
    const current = original.entries.filter(e => e.sectionKey === fix.sectionKey && e.title === fix.title);
    if (!old.length && current.length === 1) {
      const source = sources.records[animeSourceKey(current[0])];
      if (source?.malId !== fix.malId || source?.anilistId !== fix.anilistId || sources.records[animeSourceKey({title: fix.oldTitle, sectionKey: fix.sectionKey})]) throw Error(`已改名但來源不一致：${fix.title}`);
      mappings.push({ ...fix, oldKey: JSON.stringify(['anime', fix.sectionKey, fix.oldTitle, 0]), newKey: current[0].hideKey });
      continue;
    }
    if (old.length !== 1 || current.length) throw Error(`作品缺少或重複：${fix.oldTitle}`);
    const entry = old[0];
    const sourceKey = animeSourceKey(entry);
    if (sources.records[sourceKey]?.status !== 'needs-review' || sources.records[animeSourceKey(fix)]) throw Error(`來源已有其他變更：${fix.oldTitle}`);
    const item = evidence.find(e => e.id === fix.anilistId && e.idMal === fix.malId);
    if (!item) throw Error(`缺少核對證據：${fix.title}`);
    const lines = report.split(/(?<=\n)/);
    const line = lines[entry.lineStart];
    if (!line?.includes(fix.oldTitle)) throw Error('報告行號不一致');
    lines[entry.lineStart] = line.replace(fix.oldTitle, fix.title);
    report = lines.join('');
    const changed = parseReport('anime', report).entries.find(e => e.sectionKey === fix.sectionKey && e.title === fix.title);
    mappings.push({ ...fix, oldKey: entry.hideKey, newKey: changed.hideKey });
    delete sources.records[sourceKey];
    sources.records[animeSourceKey(fix)] = {
      title: fix.title, sectionKey: fix.sectionKey, malId: fix.malId, anilistId: fix.anilistId,
      originalTitle: item.title.romaji, nativeTitle: item.title.native, source: 'AniList', sourceUrl: item.siteUrl,
      year: item.startDate.year, episodes: item.episodes, format: item.format, coverUrl: item.coverImage.large,
      trailer: item.trailer?.site === 'youtube' ? { url: `https://www.youtube.com/watch?v=${item.trailer.id}` } : null,
      savedAt: new Date().toISOString(), provenance: 'reviewed-correction', previousTitle: fix.oldTitle,
      evidence: 'docs/anime-source-repair/CONFLICT_INVESTIGATION.md',
    };
  }
  if (report !== before.get('動畫.md').toString('utf8')) {
    after.set('動畫.md', Buffer.from(report));
    after.set('.catchlist-anime-sources.json', encode(sources));
  }
  for (const [filename, field] of [['.catchlist-favorites.json', 'key'], ['.catchlist-hidden.json', 'hideKey']]) {
    if (!before.get(filename)) continue;
    const data = json(before.get(filename));
    if (data.version !== 1 || !Array.isArray(data.entries)) throw Error(`個人紀錄格式錯誤：${filename}`);
    let changed = false;
    for (const map of mappings) {
      if (data.entries.some(e => e[field] === map.oldKey) && data.entries.some(e => e[field] === map.newKey)) throw Error(`個人紀錄衝突：${filename}`);
      for (const entry of data.entries) if (entry[field] === map.oldKey) {
        entry[field] = map.newKey; entry.title = map.title; changed = true;
      }
    }
    if (changed) after.set(filename, encode(data));
  }
  if (before.get('.catchlist-visits.json')) {
    const data = json(before.get('.catchlist-visits.json'));
    if (data.version !== 1 || !data.media || (data.media.anime && !Array.isArray(data.media.anime.keys))) throw Error('閱讀紀錄格式錯誤');
    let changed = false;
    if (data.media.anime) data.media.anime.keys = [...new Set(data.media.anime.keys.map(key => {
      const map = mappings.find(m => m.oldKey === key);
      if (map) changed = true;
      return map?.newKey ?? key;
    }))];
    if (changed) after.set('.catchlist-visits.json', encode(data));
  }
  return { directory, before, after, mappings, changed: filenames.filter(name => hash(before.get(name)) !== hash(after.get(name))) };
}

function replace(file, bytes) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, bytes, { flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

export function applyCorrection(plan) {
  const unchanged = () => {
    for (const name of filenames) if (hash(read(path.join(plan.directory, name))) !== hash(plan.before.get(name))) throw Error(`檔案被其他程序修改，停止寫入：${name}`);
  };
  unchanged();
  if (!plan.changed.length) return { changed: [], backup: null };
  const backup = path.join(plan.directory, '.catchlist-backups', `anime-conflicts-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`);
  fs.mkdirSync(backup, { recursive: true });
  for (const [name, bytes] of plan.before) if (bytes !== null) fs.writeFileSync(path.join(backup, name), bytes, { flag: 'wx' });
  const manifest = { createdAt: new Date().toISOString(), corrections: plan.mappings, files: filenames.map(name => ({ name, before: hash(plan.before.get(name)), after: hash(plan.after.get(name)) })) };
  fs.writeFileSync(path.join(backup, 'manifest.json'), encode(manifest));
  unchanged();
  const written = [];
  try {
    for (const name of plan.changed) {
      const file = path.join(plan.directory, name);
      if (hash(read(file)) !== hash(plan.before.get(name))) throw Error(`檔案被其他程序修改：${name}`);
      replace(file, plan.after.get(name)); written.push(name);
    }
    for (const name of filenames) if (hash(read(path.join(plan.directory, name))) !== hash(plan.after.get(name))) throw Error(`寫入後資料不一致：${name}`);
  } catch (error) {
    for (const name of written.reverse()) {
      const file = path.join(plan.directory, name);
      if (hash(read(file)) === hash(plan.after.get(name))) replace(file, plan.before.get(name));
    }
    throw Error(`${error.message}；備份：${backup}`);
  }
  return { changed: plan.changed, backup };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv.find(arg => arg.startsWith('--data-dir='))?.slice(11);
  if (!directory) throw Error('請指定 --data-dir=資料夾；--apply 才寫入，預設僅預覽');
  const plan = prepareCorrection(directory);
  console.log(JSON.stringify(process.argv.includes('--apply') ? applyCorrection(plan) : { changed: plan.changed, corrections: plan.mappings }, null, 2));
}
