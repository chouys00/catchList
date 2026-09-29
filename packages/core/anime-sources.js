import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWriteFile, sanitizeDisplayText } from './safe-output.js';

export const ANIME_SOURCES_FILE = '.catchlist-anime-sources.json';
export const animeSourceKey = entry => crypto.createHash('sha256').update(JSON.stringify([String(entry.title).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(), entry.sectionKey])).digest('hex');
export const animeDisplayTitle = item => sanitizeDisplayText(item.name_cn || item.title_cn || item.title_japanese || item.title) || '未命名';
const hasIdentity = record => [record.malId, record.anilistId].some(id => Number.isSafeInteger(id) && id > 0);
const validRecord = record => record && record.title && record.sectionKey && (hasIdentity(record) || (record.status === 'needs-review' && typeof record.reason === 'string'));

export function readAnimeSources(directory) {
  const file = path.join(directory, ANIME_SOURCES_FILE);
  if (!fs.existsSync(file)) return { version: 1, records: {} };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.version !== 1 || !data.records || Array.isArray(data.records) || typeof data.records !== 'object') throw Error('動畫來源檔格式不正確，原檔已保留');
  for (const [key, record] of Object.entries(data.records)) {
    if (!validRecord(record) || key !== animeSourceKey(record)) throw Error('動畫來源對照不正確，原檔已保留');
  }
  return data;
}

export function saveAnimeSources(directory, records) {
  const existing = readAnimeSources(directory);
  for (const record of records) {
    if (!validRecord(record)) throw Error('動畫缺少有效來源編號，停止寫入；舊暫存請重新抓取');
    existing.records[animeSourceKey(record)] = record;
  }
  atomicWriteFile(path.join(directory, ANIME_SOURCES_FILE), JSON.stringify(existing, null, 2) + '\n', 'utf8');
}

export function sourceRecord(item, sectionKey) {
  return {
    title: animeDisplayTitle(item), sectionKey, malId: item.mal_id,
    originalTitle: item.title || null, nativeTitle: item.title_japanese || null,
    bangumiId: item.bangumiId ?? null,
    source: 'MyAnimeList', sourceUrl: `https://myanimelist.net/anime/${item.mal_id}`,
    coverUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
    trailer: item.trailer || null, episodes: item.episodes ?? null, format: item.type ?? null,
    savedAt: new Date().toISOString(), provenance: 'tracker',
  };
}
