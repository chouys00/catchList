import fs from 'fs';
import path from 'path';
import { EN_TO_ZH } from './constants.js';

export function seasonToZh(season) {
  const s = String(season || '').toLowerCase();
  switch (s) {
    case 'winter': return '冬';
    case 'spring': return '春';
    case 'summer': return '夏';
    case 'fall':   return '秋';
    default: return EN_TO_ZH[s] || s || '未知';
  }
}

export function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y  = date.getFullYear();
  const m  = pad(date.getMonth() + 1);
  const d  = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

export function buildBatchText({ year, season, minScore, items }) {
  const seasonZh = seasonToZh(season);
  const scoreStr = Number.isFinite(minScore) ? minScore.toFixed(2) : String(minScore);
  const headerLine = `${year}  ${seasonZh}  >${scoreStr}    (更新時間: ${formatTimestamp()})`;

  const lines = [headerLine, ''];

  for (const item of items) {
    const name =
      (item && (item.name_cn || item.title_cn || item.title_japanese || item.title)) || '未命名';
    const scoreVal = item && typeof item.score === 'number' ? item.score : null;
    const score    = scoreVal != null ? scoreVal.toFixed(2) : '-';
    const episodes =
      item && (item.episodes || item.episodes === 0)
        ? String(item.episodes)
        : '未定';
    const type = (item && item.type) || '未知';

    lines.push(`- ${name}  **${score}**  (${episodes} · ${type})`);
  }

  lines.push('------------------------------');

  return lines.join('\n');
}

export function saveStacked(targetPath, batchText) {
  const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
  const hasExisting = existing.trim().length > 0;
  const finalText = hasExisting ? `${batchText}\n\n${existing}` : batchText;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, finalText, 'utf8');
}
