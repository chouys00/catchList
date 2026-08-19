import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

export const DEFAULT_OUTPUT_FILE = "G:/我的雲端硬碟/CatchList/真人劇.md";
export const OBSERVATION_DELAY_MONTHS = 6;
export const INITIAL_BACKFILL_MONTHS = 12;

export function defaultCachePaths() {
  return {
    tmdb: path.join(PACKAGE_ROOT, ".cache", "tmdb.json"),
    wikidata: path.join(PACKAGE_ROOT, ".cache", "wikidata-names.json")
  };
}
