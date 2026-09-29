import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as OpenCC from "opencc-js";

const traditional = OpenCC.Converter({ from: "cn", to: "tw" });
const normalize = (text) => traditional(String(text ?? "")).normalize("NFKC").toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, "");
const DAY = 86_400_000;
export const animeMediaKey = (entry) => crypto.createHash("sha256").update(JSON.stringify([entry.title, entry.sectionKey])).digest("hex");

export function animeCoverUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" && ["cdn.myanimelist.net", "s4.anilist.co"].includes(url.hostname) ? url.href : null; }
  catch { return null; }
}

export function trailerUrl(trailer) {
  for (const value of [trailer?.url, trailer?.embed_url]) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || !["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtu.be"].includes(url.hostname)) continue;
      const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : url.searchParams.get("v");
      if (/^[\w-]{11}$/.test(id ?? "")) return `https://www.youtube.com/watch?v=${id}`;
    } catch { /* 空值及未知影片來源不提供外連。 */ }
  }
  return null;
}

export function candidateFromAnime(anime) {
  return {
    malId: anime.mal_id, title: anime.title_japanese || anime.title,
    originalTitle: anime.title, year: anime.year ?? (Number(anime.aired?.from?.slice(0, 4)) || null),
    format: anime.type ?? null, episodes: anime.episodes ?? null,
    coverUrl: animeCoverUrl(anime.images?.jpg?.large_image_url) || animeCoverUrl(anime.images?.jpg?.image_url),
    aliases: [...(anime.titles ?? []).map(item => item.title), anime.title, anime.title_japanese, anime.title_english, ...(anime.title_synonyms ?? [])].filter(Boolean),
  };
}

function fromAniList(media) {
  const format = { TV: "TV", TV_SHORT: "TV", MOVIE: "Movie", SPECIAL: "Special", OVA: "OVA", ONA: "ONA", MUSIC: "Music" }[media.format] ?? media.format;
  return {
    malId: media.idMal, title: media.title.native || media.title.romaji || media.title.english,
    originalTitle: media.title.romaji || media.title.english,
    year: media.seasonYear ?? media.startDate?.year ?? null,
    format, episodes: media.episodes,
    coverUrl: animeCoverUrl(media.coverImage?.large),
    aliases: [...Object.values(media.title), ...(media.synonyms ?? [])].filter(Boolean),
  };
}

const ANILIST_FIELDS = "idMal title { native romaji english } synonyms seasonYear startDate { year } format episodes coverImage { large } trailer { id site }";

export function exactAnimeMatch(candidates, names, entry) {
  const targets = new Set(names.map(normalize));
  const exact = candidates.filter(item => item.aliases.some(name => targets.has(normalize(name)))
    && (!entry.year || item.year === entry.year)
    && (!entry.format || item.format === entry.format));
  return exact.length === 1 ? exact[0] : null;
}

export class AnimeMediaService {
  constructor(filePath, { fetchImpl = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), interval = 1100, now = Date.now } = {}) {
    this.filePath = filePath;
    this.fetch = fetchImpl;
    this.wait = wait;
    this.interval = interval;
    this.now = now;
    this.queue = Promise.resolve();
    this.nextRequestAt = 0;
    this.pending = new Map();
    this.records = {};
    try { const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")); if (parsed.version === 1 && parsed.records && typeof parsed.records === "object") this.records = parsed.records; } catch { /* 可重新取得的獨立快取。 */ }
  }

  request(url, options = {}) {
    const task = this.queue.then(async () => {
      await this.wait(Math.max(0, this.nextRequestAt - this.now()));
      this.nextRequestAt = this.now() + this.interval;
      const response = await this.fetch(url, { ...options, signal: AbortSignal.timeout(12000), headers: { "User-Agent": "CatchListReader/1.0 (anime metadata)", ...options.headers } });
      if (!response.ok) throw new Error(`來源暫時無法讀取（HTTP ${response.status}）`);
      return response.json();
    });
    this.queue = task.catch(() => {});
    return task;
  }

  async anilist(query, variables) {
    const result = await this.request("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
    if (result.errors || !result.data) throw new Error("備援來源暫時無法讀取");
    return result.data;
  }

  save(key, value) {
    this.records[key] = { ...value, savedAt: this.now() };
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const temp = `${this.filePath}.${process.pid}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ version: 1, records: this.records }), "utf8");
      fs.renameSync(temp, this.filePath);
    } catch { return { ...value, cacheWarning: "本次資料尚未保存，下次開啟可能重新查詢" }; }
    return value;
  }

  async search(query) {
    const text = String(query ?? "").trim();
    if (!text || text.length > 200) throw new Error("請輸入 1～200 字的作品名稱或 MAL 編號");
    const id = text.match(/^(?:https:\/\/myanimelist\.net\/anime\/)?(\d+)(?:\/[^\s]*)?$/)?.[1];
    if (id) {
      try {
        const result = await this.request(`https://api.jikan.moe/v4/anime/${id}`);
        return { candidates: [candidateFromAnime(result.data)], names: [text] };
      } catch {
        const data = await this.anilist(`query ($id: Int) { Media(idMal: $id, type: ANIME) { ${ANILIST_FIELDS} } }`, { id: Number(id) });
        return { candidates: [fromAniList(data.Media)], names: [text] };
      }
    }
    const names = [text];
    // Bangumi 只用完全相同的中文名稱補原名，不把搜尋排名當成作品身分。
    if (/\p{Script=Han}/u.test(text)) {
      try {
        const data = await this.request(`https://api.bgm.tv/search/subject/${encodeURIComponent(text)}?type=2`);
        for (const item of data.list ?? []) {
          if ([item.name_cn, item.name].some(name => normalize(name) === normalize(text)) && item.name) names.push(item.name);
        }
      } catch { /* Jikan 仍可直接查原名稱。 */ }
    }
    const queryName = names.at(-1);
    let candidates;
    try {
      const result = await this.request(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(queryName)}&limit=10`);
      candidates = (result.data ?? []).map(candidateFromAnime);
    } catch {
      const data = await this.anilist(`query ($search: String) { Page(perPage: 10) { media(search: $search, type: ANIME) { ${ANILIST_FIELDS} } } }`, { search: queryName });
      candidates = data.Page.media.filter(item => item.idMal).map(fromAniList);
    }
    const unique = new Map(candidates.map(item => [item.malId, item]));
    return { candidates: [...unique.values()], names };
  }

  async details(malId) {
    if (!Number.isSafeInteger(Number(malId)) || Number(malId) < 1) throw new Error("作品編號不正確");
    let candidate, url, source;
    try {
      const { data } = await this.request(`https://api.jikan.moe/v4/anime/${Number(malId)}`);
      if (!data || data.mal_id !== Number(malId)) throw new Error("來源未回傳正確作品");
      candidate = candidateFromAnime(data);
      url = trailerUrl(data.trailer);
      source = "MyAnimeList";
    } catch {
      const data = await this.anilist(`query ($id: Int) { Media(idMal: $id, type: ANIME) { ${ANILIST_FIELDS} } }`, { id: Number(malId) });
      if (data.Media?.idMal !== Number(malId)) throw new Error("來源未回傳正確作品");
      candidate = fromAniList(data.Media);
      url = data.Media.trailer?.site === "youtube" ? trailerUrl({ url: `https://www.youtube.com/watch?v=${data.Media.trailer.id}` }) : null;
      source = "AniList";
    }
    let trailerTitle = "宣傳影片";
    let trailerUnavailable = false;
    if (!url && source === "MyAnimeList") {
      try {
        const videos = await this.request(`https://api.jikan.moe/v4/anime/${Number(malId)}/videos`);
        const promo = videos.data?.promo?.find(item => trailerUrl(item.trailer));
        if (promo) { url = trailerUrl(promo.trailer); trailerTitle = promo.title || trailerTitle; }
      } catch { trailerUnavailable = true; }
    }
    let trailerAuthor = "YouTube";
    if (url) {
      try {
        const info = await this.request(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        trailerTitle = String(info.title || trailerTitle).slice(0, 300);
        trailerAuthor = String(info.author_name || trailerAuthor).slice(0, 120);
      } catch { /* 外連仍保留，不把標題查詢失敗視為影片不存在。 */ }
    }
    return { ...candidate, status: "ready", source, trailerUnavailable, trailerUrl: url, trailerTitle: url ? trailerTitle : null, trailerAuthor: url ? trailerAuthor : null };
  }

  resolve(entry, { retry = false } = {}) {
    if (entry.sourceWarning) return Promise.resolve({ status: "error", cacheWarning: entry.sourceWarning });
    const key = animeMediaKey(entry);
    if (this.pending.has(key)) return this.pending.get(key);
    const cached = this.records[key];
    const source = entry.sourceRecord;
    if (source?.status === "needs-review" && !cached?.manualSelection) return Promise.resolve({ status: "unmatched", candidates: [], cacheWarning: source.reason });
    if (!retry && source && [source.malId, source.anilistId].some(id => Number.isSafeInteger(id) && id > 0)) {
      if (cached?.status === "ready" && (cached.manualSelection || cached.malId === source.malId)) return Promise.resolve(cached);
      const url = trailerUrl(source.trailer);
      return Promise.resolve({ status: "ready", malId: source.malId, source: source.source,
        anilistId: source.anilistId, title: source.nativeTitle || source.originalTitle || entry.title, originalTitle: source.originalTitle,
        year: source.year ?? entry.year, format: source.format, episodes: source.episodes,
        coverUrl: animeCoverUrl(source.coverUrl), trailerUrl: url,
        trailerTitle: url ? source.trailerTitle || "宣傳影片" : null,
        trailerAuthor: url ? source.trailerAuthor || "YouTube" : null,
        cacheWarning: source.mediaWarning || null,
      });
    }
    if (!retry && cached && (cached.status === "ready" || this.now() - cached.savedAt < DAY)) return Promise.resolve(cached);
    const task = (async () => {
      try {
        if (source?.malId) return this.save(key, await this.details(cached?.manualSelection ? cached.malId : source.malId));
        if (retry && cached?.status === "ready") return this.save(key, await this.details(cached.malId));
        const result = await this.search(entry.title);
        const match = exactAnimeMatch(result.candidates, result.names, entry);
        if (!match) return this.save(key, { status: "unmatched", candidates: result.candidates });
        return this.save(key, await this.details(match.malId));
      } catch { return { status: "error", message: "來源暫時無法讀取，請稍後重試" }; }
    })().finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }

  async select(entry, malId) {
    // 等待先前的自動查詢，避免它稍後覆蓋使用者選定的作品。
    await this.pending.get(animeMediaKey(entry));
    return this.save(animeMediaKey(entry), { ...await this.details(malId), manualSelection: true });
  }
}
