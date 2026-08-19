import { selectTraditionalChineseName } from "./names.js";
import { scoreCandidate, selectAndSortCandidates } from "./scoring.js";

/**
 * 固定資料端到端流程：TMDb 決定資格，IMDb 與 Wikidata 只補欄位。
 * resolver 可注入固定函式，讓離線測試不需要任何外部網路。
 */
export async function buildRegionalSelections(candidates, {
  imdbIndex = new Map(),
  wikidataResolver = async () => null,
  scoring = {}
} = {}) {
  const selected = selectAndSortCandidates(candidates, {
    ...scoring,
    imdbRatingFor: undefined
  });
  // 先依 TMDb ID 去重，再補名稱；IMDb 缺漏不會改變 selected 結果。
  const enriched = [];
  for (const candidate of selected) {
    const imdb = imdbIndex.get(candidate.externalIds?.imdbId);
    // selectAndSortCandidates 接受單一固定 imdbRating；此處重新評分以套用每筆 ID。
    const finalCandidate = scoreCandidate(candidate, { ...scoring, imdbRating: imdb });
    const wikiName = await wikidataResolver(candidate.externalIds?.wikidataId);
    const name = selectTraditionalChineseName(candidate, wikiName);
    enriched.push({
      ...finalCandidate,
      ...name,
      regionLabel: finalCandidate.region,
      tmdbUrl: `https://www.themoviedb.org/tv/${finalCandidate.tmdbId}`
    });
  }
  const regions = Object.groupBy ? Object.groupBy(enriched, (item) => item.region) : enriched.reduce((out, item) => {
    (out[item.region] ??= []).push(item);
    return out;
  }, {});
  return { selections: enriched, regions };
}
