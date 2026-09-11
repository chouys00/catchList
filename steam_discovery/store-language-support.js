const UNKNOWN = "unknown";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Steam 會在繁中頁面額外插入「繁體中文／不支援」列。
 * 只有語言表內真的出現勾選符號時才算支援。
 */
export function parseSteamLanguageSupport(html, language) {
  const source = String(html ?? "");
  const table = source.match(/<table\b[^>]*class=["'][^"']*\bgame_language_options\b[^"']*["'][^>]*>[\s\S]*?<\/table>/i)?.[0];
  if (!table) return UNKNOWN;

  const languagePattern = new RegExp(`<td\\b[^>]*>\\s*${escapeRegex(language)}\\s*<\\/td>`, "i");
  const row = [...table.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)]
    .map((match) => match[0])
    .find((candidate) => languagePattern.test(candidate));

  if (!row || /<tr\b[^>]*class=["'][^"']*\bunsupported\b/i.test(row) || />\s*不支援\s*</i.test(row)) {
    return false;
  }
  return /&#(?:10004|x2714);|✓/i.test(row);
}
