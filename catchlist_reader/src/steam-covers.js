export function isSteamStaticUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)steamstatic\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export async function resolveSteamCover(appid, fetchImpl = fetch, { timeoutMs = 8_000 } = {}) {
  if (!/^\d+$/.test(String(appid))) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=tw&l=tchinese`, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    const headerImage = data?.[appid]?.success ? data[appid].data?.header_image : null;
    return isSteamStaticUrl(headerImage) ? headerImage : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
