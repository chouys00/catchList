import assert from "node:assert/strict";
import test from "node:test";

import { applyDeleteResult, applyUndoResult } from "../src/renderer/library-state.js";

function fixture() {
  const entries = [
    { id: "a", sectionKey: "2026-春", periodLabel: "2026 年春季", year: 2026, season: "春", title: "甲" },
    { id: "b", sectionKey: "2025-冬", periodLabel: "2025 年冬季", year: 2025, season: "冬", title: "乙" },
  ];
  return { dataDir: "C:\\CatchList", canUndo: false, libraries: [
    { media: "anime", entries, sections: [
      { key: "2026-春", label: "2026 年春季", year: 2026, season: "春" },
      { key: "2025-冬", label: "2025 年冬季", year: 2025, season: "冬" },
    ] },
    { media: "movies", entries: [{ id: "movie" }], sections: [] },
  ] };
}

test("刪除結果只替換受影響清單並保留復原資料", () => {
  const original = fixture();
  const result = applyDeleteResult(original, { media: "anime", entryId: "a", canUndo: true });

  assert.deepEqual(result.payload.libraries[0].entries.map((entry) => entry.id), ["b"]);
  assert.deepEqual(result.payload.libraries[0].sections.map((section) => section.key), ["2025-冬"]);
  assert.equal(result.payload.libraries[1], original.libraries[1]);
  assert.equal(result.payload.canUndo, true);
  assert.equal(result.removed.entry.id, "a");
  assert.equal(result.removed.index, 0);
});

test("復原結果依原位置加回作品並恢復區段", () => {
  const deleted = applyDeleteResult(fixture(), { media: "anime", entryId: "a", canUndo: true });
  const restored = applyUndoResult(deleted.payload, { media: "anime", entryId: "a", title: "甲", canUndo: false }, deleted.removed);

  assert.deepEqual(restored.libraries[0].entries.map((entry) => entry.id), ["a", "b"]);
  assert.deepEqual(restored.libraries[0].sections.map((section) => section.key), ["2026-春", "2025-冬"]);
  assert.equal(restored.canUndo, false);
});

test("錯誤或不相符的局部結果不修改原 payload", () => {
  const original = fixture();
  assert.throws(() => applyDeleteResult(original, { media: "anime", entryId: "missing", canUndo: true }), /不在目前清單/);
  assert.deepEqual(original.libraries[0].entries.map((entry) => entry.id), ["a", "b"]);
  assert.throws(() => applyUndoResult(original, { media: "anime", entryId: "a", canUndo: false }, null), /找不到可加回/);
});
