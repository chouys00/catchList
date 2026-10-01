import { trailerUrl } from "./anime-media.js";

export function validExternalUrl(raw) {
  if (typeof raw !== "string") return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    if (url.hostname === "howlongtobeat.com") {
      return url.pathname === "/" && Boolean(url.searchParams.get("q")?.trim())
        && !url.username && !url.password && !url.port;
    }
    return url.hostname === "www.google.com" || url.hostname === "store.steampowered.com"
      || url.hostname === "www.imdb.com" || trailerUrl({ url: raw }) === raw;
  } catch {
    return false;
  }
}

export async function openExternalUrls(urls, openExternal) {
  if (!Array.isArray(urls) || urls.length > 250 || urls.some(url => !validExternalUrl(url))) {
    throw new Error("外部連結不正確或數量過多");
  }
  for (const url of [...new Set(urls)]) await openExternal(url, { activate: false });
  return true;
}
