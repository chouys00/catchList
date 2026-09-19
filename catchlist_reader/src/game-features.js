// Steam「玩家人數」功能 ID；不從社群標籤或一般附加功能反推多人。
// 遠端同樂（44）也能用於單人遊戲的觀看與輪流操作；PvP 類型不在本清單需求內。
export const MULTIPLAYER_FEATURE_IDS = new Set([1, 9, 20, 24, 27, 38, 39, 48]);

export function normalizeFeatureIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => Number(value?.id ?? value)).filter((id) => Number.isInteger(id) && id > 0))];
}

export function classifyPlayerMode(values) {
  const ids = normalizeFeatureIds(values);
  if (ids.some((id) => MULTIPLAYER_FEATURE_IDS.has(id))) return "multi";
  return ids.includes(2) ? "single" : "unknown";
}

export function parseOfficialFeatures(html) {
  const ids = [];
  for (const match of String(html ?? "").matchAll(/<a\b([^>]*)>[\s\S]*?<\/a>/gi)) {
    if (!/\bclass=["'][^"']*\bgame_area_details_specs_ctn\b[^"']*["']/i.test(match[1])) continue;
    const id = match[1].match(/\bhref=["'][^"']*[?&]category2=(\d+)(?=[&"'])/i)?.[1];
    if (id) ids.push(id);
  }
  return normalizeFeatureIds(ids);
}
