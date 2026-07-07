// ============================================================
// months.js — 年月區間計算(imdb_tracker 與 steam_discovery 共用)
// ============================================================

/** 產生 "YYYY-MM" 格式的月份鍵 */
export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * 計算兩個年月之間的所有月份(含起點與終點)
 * @returns {Map<number, Set<number>>} Map<year, Set<month>>
 */
export function getMonthsBetween(startYear, startMonth, endYear, endMonth) {
  const groups = new Map();
  let y = startYear;
  let m = startMonth;

  while (y < endYear || (y === endYear && m <= endMonth)) {
    if (!groups.has(y)) groups.set(y, new Set());
    groups.get(y).add(m);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return groups;
}
