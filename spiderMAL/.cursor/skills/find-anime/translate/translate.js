import { fileURLToPath } from 'url';
import { searchBangumi, pickBestMatch, toTraditional } from '../lib/bangumi.js';

function printResult(rawTitle, subject) {
  console.log(`原始名稱：${rawTitle}`);

  if (!subject) {
    console.log('目前在 Bangumi 找不到此作品的中文名稱。');
    return;
  }

  const cn = toTraditional(subject.name_cn || subject.name || rawTitle);
  console.log(`中文名稱：${cn}`);
  console.log('來源：Bangumi');

  if (subject.id != null) {
    console.log(`連結：https://bangumi.tv/subject/${subject.id}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const rawTitle = args.join(' ').trim();

  if (!rawTitle) {
    console.log('\n用法：');
    console.log('  node .cursor/skills/find-anime/translate/translate.js <原始名稱>\n');
    console.log('範例：');
    console.log('  node .cursor/skills/find-anime/translate/translate.js 薫る花は凛と咲く\n');
    process.exit(1);
  }

  try {
    console.log(`\n🔎 正在使用 Bangumi 搜尋：「${rawTitle}」的中文名稱...\n`);
    const results = await searchBangumi(rawTitle);
    const best = pickBestMatch(rawTitle, results);
    printResult(rawTitle, best);
  } catch (err) {
    console.error('❌ 發生錯誤:', err.response?.data ?? err.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
