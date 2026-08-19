export const REGION_KEYS = Object.freeze(["kr", "jp", "tw", "cn", "western"]);

export const REGION_LABELS = Object.freeze({
  kr: "韓劇",
  jp: "日劇",
  tw: "台劇",
  cn: "陸劇",
  western: "歐美劇"
});

export const EXCLUSION_REASONS = Object.freeze({
  ADULT: "adult",
  ANIMATION: "animation",
  DOCUMENTARY: "documentary",
  REALITY: "reality",
  NEWS: "news",
  TALK: "talk",
  SINGLE_EPISODE: "single_episode",
  MISSING_GENRES: "missing_genres",
  MISSING_TYPE: "missing_type",
  MISSING_ORIGIN_COUNTRY: "missing_origin_country",
  UNSUPPORTED_REGION: "unsupported_region",
  UNSCRIPTED_TYPE: "unscripted_type"
});

export function normalizeShowCandidate(discover, details = {}, translations = [], externalIds = {}) {
  const genreIds = Array.isArray(discover?.genre_ids)
    ? discover.genre_ids.filter(Number.isInteger)
    : Array.isArray(details?.genres)
      ? details.genres.map((genre) => genre?.id).filter(Number.isInteger)
      : [];
  const genreNames = Array.isArray(details?.genres)
    ? details.genres.map((genre) => genre?.name).filter((name) => typeof name === "string" && name.trim() !== "")
    : [];
  const originCountries = Array.isArray(details?.origin_country)
    ? details.origin_country.filter(Boolean)
    : Array.isArray(discover?.origin_country)
      ? discover.origin_country.filter(Boolean)
      : [];

  return {
    tmdbId: Number(discover?.id ?? details?.id),
    originalName: details?.original_name ?? discover?.original_name ?? discover?.name ?? null,
    firstAirDate: details?.first_air_date ?? discover?.first_air_date ?? null,
    originCountries,
    genreIds,
    genreNames,
    type: details?.type ?? null,
    episodeCount: Number.isInteger(details?.number_of_episodes) ? details.number_of_episodes : null,
    adult: Boolean(details?.adult ?? discover?.adult),
    voteAverage: Number(details?.vote_average ?? discover?.vote_average ?? 0),
    voteCount: Number(details?.vote_count ?? discover?.vote_count ?? 0),
    translations: Array.isArray(translations) ? translations : [],
    externalIds: {
      imdbId: externalIds?.imdb_id ?? null,
      wikidataId: externalIds?.wikidata_id ?? null
    }
  };
}
