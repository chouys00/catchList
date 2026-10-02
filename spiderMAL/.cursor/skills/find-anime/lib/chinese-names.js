import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { fileURLToPath } from 'node:url';
import { atomicWriteFile } from '@catchlist/core';
import * as OpenCC from 'opencc-js';

const convert = OpenCC.Converter({ from: 'cn', to: 'tw' });
const headers = { 'User-Agent': 'CatchList/1.0 (anime title lookup)' };
export const normalizeName = value => String(value ?? '').normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu, '').toLowerCase();
const nameFile = fileURLToPath(new URL('./chinese-name-overrides.json', import.meta.url));
export function reviewedName(item) {
  const record = JSON.parse(fs.readFileSync(nameFile, 'utf8'))[item.mal_id];
  return record && record.originalTitle === item.title ? record : null;
}
function aliases(item) {
  return [item.title_japanese, item.title, item.title_english, ...(item.title_synonyms ?? []), ...(item.titles ?? []).map(t => t.title)].filter(Boolean);
}
export function matchChineseCandidate(item, candidates) {
  const names = aliases(item).map(normalizeName);
  const start = Date.parse(item.aired?.from);
  const matches = candidates.filter(candidate => {
    if (candidate.type !== 2 || !candidate.name_cn?.trim() || /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(candidate.name_cn) || !Number.isFinite(start)) return false;
    if (Math.abs(Date.parse(candidate.date) - start) > 2 * 86400000 || !Number.isFinite(Date.parse(candidate.date))) return false;
    if (item.episodes && candidate.eps && item.episodes !== candidate.eps) return false;
    if (item.type === 'TV' && candidate.platform !== 'TV') return false;
    if (item.type === 'Movie' && candidate.platform !== '剧场版') return false;
    if (item.type === 'OVA' && !['OVA', 'OAD'].includes(candidate.platform)) return false;
    if (item.type === 'ONA' && candidate.platform !== 'WEB') return false;
    const candidateNames = [candidate.name, ...(candidate.infobox ?? []).filter(i => i.key === '别名').flatMap(i => Array.isArray(i.value) ? i.value.map(v => v.v) : [i.value])].map(normalizeName);
    return candidateNames.some(name => names.includes(name));
  });
  return matches.length === 1 ? matches[0] : null;
}
export async function anilistAliases(item, { post = axios.post } = {}) {
  const { data } = await post('https://graphql.anilist.co', {
    query: 'query($id:Int!){Media(idMal:$id,type:ANIME){idMal title{native romaji english} synonyms}}', variables: { id: item.mal_id },
  }, { timeout: 15000 });
  const media = data?.data?.Media;
  if (media?.idMal !== item.mal_id) throw Error('AniList 作品編號不符');
  return [...Object.values(media.title ?? {}), ...(media.synonyms ?? [])].filter(Boolean);
}
export async function resolveChineseName(item, search, {
  get = axios.get, fallback = anilistAliases, wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const reviewed = reviewedName(item);
  if (reviewed) return { title: reviewed.title, bangumiId: reviewed.bangumiId, sourceUrl: reviewed.sourceUrl, method: 'reviewed' };
  let queries = [...new Set(aliases(item))].slice(0, 3);
  let identityItem = item;
  const subjects = new Map();
  const checked = new Set();
  const errors = [];
  for (let round = 0; round < 2; round++) {
    for (const query of queries) {
      if (checked.has(query)) continue;
      checked.add(query);
      try {
        const hits = await search(query);
        for (const hit of hits.slice(0, 20)) {
          if (subjects.has(hit.id) || !hit.name_cn) continue;
          try {
            const { data } = await get(`https://api.bgm.tv/v0/subjects/${hit.id}`, { timeout: 15000, headers });
            subjects.set(hit.id, data);
          } catch (error) { errors.push(`${hit.id}：${error.response?.status ?? error.message}`); }
          await wait(300);
        }
      } catch (error) { errors.push(`${error.response?.status ?? error.message}`); }
      await wait(300);
    }
    const match = matchChineseCandidate(identityItem, [...subjects.values()]);
    if (match) return { title: convert(match.name_cn.trim()), bangumiId: match.id, sourceUrl: `https://bangumi.tv/subject/${match.id}`, method: round ? 'anilist-alias-bangumi' : 'bangumi-identity' };
    if (!round) {
      try {
        const extraAliases = [...new Set(await fallback(item))];
        identityItem = { ...item, title_synonyms: [...(item.title_synonyms ?? []), ...extraAliases] };
        queries = extraAliases.filter(query => !checked.has(query)).slice(0, 3);
      }
      catch (error) { errors.push(`AniList：${error.response?.status ?? error.message}`); queries = []; }
    }
  }
  return { title: null, reason: errors.length ? `來源查詢失敗或無可靠配對：${errors.join('；')}` : '沒有符合名稱、首播日期、類型與集數的唯一中文名稱' };
}

export function requireChineseNames(items, { directory = fileURLToPath(new URL('../../../../../output/anime-name-review/', import.meta.url)) } = {}) {
  const pendingFile = path.join(directory, 'pending.json');
  let saved = { version: 1, items: [] };
  if (fs.existsSync(pendingFile)) saved = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
  const ids = new Set(items.map(item => item.mal_id));
  const pending = items.filter(item => !item.title_cn?.trim() || /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(item.title_cn) || item.chineseNameStatus !== 'resolved');
  const records = [...saved.items.filter(item => !ids.has(item.malId)), ...pending.map(item => ({ malId: item.mal_id, title: item.title, nativeTitle: item.title_japanese, aired: item.aired?.from, reason: item.chineseNameReason ?? '中文名稱尚未確認', checkedAt: new Date().toISOString() }))];
  if (records.length || fs.existsSync(pendingFile)) {
    fs.mkdirSync(directory, { recursive: true });
    atomicWriteFile(pendingFile, JSON.stringify({ version: 1, items: records }, null, 2) + '\n', 'utf8');
  }
  if (pending.length) throw Error(`${pending.length} 部動畫中文名稱待確認，本批未寫入；待補清單：${pendingFile}。下次更新會重新查詢。`);
}
