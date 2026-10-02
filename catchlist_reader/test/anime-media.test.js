import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AnimeMediaService, candidateFromAnime, exactAnimeMatch, trailerUrl, animeCoverUrl } from "../src/anime-media.js";

test("已核對的新清單來源直接提供封面與影片，覆蓋未配對快取且不查網路", async () => {
  const records = JSON.parse(fs.readFileSync(new URL('../../docs/anime-source-repair/reviewed-sources.json', import.meta.url))).records;
  const service = new AnimeMediaService(path.join(os.tmpdir(), 'nonexistent-anime-source-test.json'), { fetchImpl: async () => { throw Error('不應請求'); } });
  let ready = 0, videos = 0, review = 0;
  for (const sourceRecord of records) {
    const result = await service.resolve({ title: sourceRecord.title, sectionKey: sourceRecord.sectionKey, sourceRecord });
    if (sourceRecord.status === 'needs-review') { assert.equal(result.status, 'unmatched'); assert.ok(result.cacheWarning); review++; }
    else { assert.equal(result.status, 'ready'); assert.ok(animeCoverUrl(result.coverUrl)); assert.equal(result.malId, sourceRecord.malId); ready++; if (result.trailerUrl) { assert.equal(trailerUrl({url:result.trailerUrl}),result.trailerUrl); videos++; } }
  }
  assert.deepEqual({ready,videos,review},{ready:62,videos:57,review:3});
});

test("待確認結果一天後重查，手動選定等待自動查詢完成且不被覆蓋", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anime-race-"));
  try {
    let clock = 0, searches = 0;
    const service = new AnimeMediaService(path.join(directory, "cache.json"), { now: () => clock });
    service.search = async () => { searches++; return { candidates: [], names: [] }; };
    await service.resolve(entry);
    await service.resolve(entry);
    assert.equal(searches, 1);
    clock = 86_400_001;
    await service.resolve(entry);
    assert.equal(searches, 2);
    let release;
    service.search = () => new Promise(resolve => { release = resolve; });
    service.details = async malId => ({ status: "ready", malId });
    const automatic = service.resolve(entry, { retry: true });
    const selected = service.select(entry, 12189);
    release({ candidates: [], names: [] });
    await automatic;
    await selected;
    assert.equal((await service.resolve(entry)).malId, 12189);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

const anime = { mal_id: 12189, title: "Hyouka", title_japanese: "氷菓", year: 2012, type: "TV", episodes: 22, images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/13/50521l.jpg" } }, trailer: { embed_url: "https://www.youtube-nocookie.com/embed/N5nNKAVB4O4?autoplay=1" } };
const entry = { title: "冰菓", year: 2012, sectionKey: "2012-春" };

test("比對保留年份與版本限制，影片網址只接受指定來源及影片 ID", () => {
  const candidate = candidateFromAnime(anime);
  assert.equal(exactAnimeMatch([candidate], ["氷菓"], entry)?.malId, 12189);
  assert.equal(exactAnimeMatch([candidate], ["氷菓"], { ...entry, year: 2025 }), null);
  assert.equal(exactAnimeMatch([candidate, { ...candidate, malId: 2 }], ["氷菓"], entry), null);
  assert.equal(exactAnimeMatch([candidate], ["氷菓"], { ...entry, format: "Movie" }), null);
  assert.equal(trailerUrl(anime.trailer), "https://www.youtube.com/watch?v=N5nNKAVB4O4");
  assert.equal(trailerUrl({ url: "https://www.youtube.com.evil.test/watch?v=N5nNKAVB4O4" }), null);
  assert.equal(animeCoverUrl("https://evil.test/a.jpg"), null);
});

test("舊中文名稱經原名比對取得媒體，跨程序快取不再查網路且不改清單", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anime-media-"));
  let calls = 0;
  const fetchImpl = async url => {
    calls++;
    let body;
    if (url.includes("api.bgm.tv")) body = { list: [{ name_cn: "冰菓", name: "氷菓" }] };
    else if (url.includes("?q=")) body = { data: [anime] };
    else if (url.includes("oembed")) body = { title: "Hyouka Promo V2", author_name: "AnimaxAsia" };
    else body = { data: anime };
    if (!url.includes("api.bgm.tv") && !url.includes("oembed")) assert.ok(url.startsWith("https://api.tenrai.org/v1/anime"));
    return { ok: true, json: async () => body };
  };
  try {
    const file = path.join(directory, "cache.json");
    const service = new AnimeMediaService(file, { fetchImpl, interval: 0 });
    const original = JSON.stringify(entry);
    const [result, duplicate] = await Promise.all([service.resolve(entry), service.resolve(entry)]);
    assert.equal(result.malId, 12189);
    assert.equal(duplicate.trailerTitle, "Hyouka Promo V2");
    assert.equal(calls, 4);
    assert.equal(JSON.stringify(entry), original);
    const reopened = new AnimeMediaService(file, { fetchImpl: async () => { throw Error("不應查詢"); } });
    assert.equal((await reopened.resolve(entry)).status, "ready");
    assert.equal(calls, 4);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("來源失敗不永久快取，Tenrai 失敗使用 AniList，支援手動選定", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anime-fallback-"));
  try {
    const service = new AnimeMediaService(path.join(directory, "cache.json"), { interval: 0, fetchImpl: async (url, options) => {
      if (!url.includes("graphql.anilist.co")) return { ok: false, status: 504 };
      const body = JSON.parse(options.body);
      const item = { idMal: 12189, title: { native: "氷菓", romaji: "Hyouka" }, seasonYear: 2012, format: "TV", episodes: 22, coverImage: { large: "https://s4.anilist.co/file/a.jpg" }, trailer: { site: "youtube", id: "N5nNKAVB4O4" } };
      return { ok: true, json: async () => ({ data: body.variables.id ? { Media: item } : { Page: { media: [item] } } }) };
    } });
    const result = await service.resolve({ ...entry, title: "氷菓" });
    assert.equal(result.source, "AniList");
    assert.equal(result.trailerUrl, "https://www.youtube.com/watch?v=N5nNKAVB4O4");
    assert.equal((await service.select(entry, 12189)).malId, 12189);
    const failing = new AnimeMediaService(path.join(directory, "errors.json"), { interval: 0, fetchImpl: async () => { throw Error("offline"); } });
    assert.equal((await failing.resolve(entry)).status, "error");
    assert.equal(fs.existsSync(path.join(directory, "errors.json")), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
