import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import electronPath from "electron";

const harnessPath = fileURLToPath(new URL("../test-support/renderer-search-harness.cjs", import.meta.url));

function runHarness() {
  return new Promise((resolve, reject) => {
    const child = spawn(electronPath, [harnessPath], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Electron 搜尋互動測試失敗（exit ${code}）\n${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim().split(/\r?\n/).at(-1)));
      } catch (error) {
        reject(new Error(`無法解析 Electron 搜尋互動結果：${error.message}\nstdout: ${stdout}\nstderr: ${stderr}`));
      }
    });
  });
}

test("搜尋欄位在輸入、刪除、游標編輯、分頁切換與清除後維持正常互動", { timeout: 60_000 }, async () => {
  const result = await runHarness();

  const { communityTagCount, ...initialGames } = result.initialGames;
  assert.ok(communityTagCount > 0);
  assert.deepEqual(initialGames, {
    railCount: 0,
    itemCount: 7,
    gamesLayout: false,
    openLabel: null,
    hideCount: 7,
    hasReviewFilter: true,
    copyButtonCount: 7,
    scoreInput: { type: "number", min: "0", max: "100", value: "" },
    brand: "CatchList test-version",
    fixtureGames: [
      { title: "HER TREES : PUZZLE DREAM", releaseDate: "2026-02-10", score: "97%", reviews: "(1,768)" },
      { title: "你有餅嗎？", releaseDate: "2026-02-08", score: "97%", reviews: "(1,500)" },
      { title: "女神的贴身男仆", releaseDate: "2026-02-06", score: "99%", reviews: "(666)" },
      { title: "Cartapli : Fold Quest", releaseDate: "2026-02-04", score: "98%", reviews: "(660)" },
      { title: "不好啦!師父被女妖精抓走了!", releaseDate: "2026-02-04", score: "96%", reviews: "(2,721)" },
      { title: "D1AL-ogue", releaseDate: "2026-02-04", score: "95%", reviews: "(1,347)" },
      { title: "銀河灰暗角落", releaseDate: "2026-02-03", score: "95%", reviews: "(562)" },
    ],
  });

  assert.deepEqual(result.typed, {
    value: "abcdef", focused: true, selectionStart: 6, selectionEnd: 6, resultCount: "0 筆結果",
  });
  assert.deepEqual(result.backspaced, {
    value: "abcd", focused: true, selectionStart: 4, selectionEnd: 4, resultCount: "0 筆結果",
  });
  assert.deepEqual(result.insertedInMiddle, {
    value: "abXcd", focused: true, selectionStart: 3, selectionEnd: 3, resultCount: "0 筆結果",
  });
  assert.deepEqual(result.replacedSelection, {
    value: "aZd", focused: true, selectionStart: 2, selectionEnd: 2, resultCount: "0 筆結果",
  });
  assert.deepEqual(result.chinese, {
    value: "你有餅嗎？", focused: true, selectionStart: 5, selectionEnd: 5, resultCount: "1 筆結果",
  });
  assert.equal(result.gameBrowser.opened, true);
  assert.deepEqual(result.gameBrowser.afterSelect, {
    nameInputStable: true,
    selectedCount: 1,
    toggleText: "標籤 1",
    itemCount: 1,
  });
  assert.deepEqual(result.gameBrowser.afterTagSearch, {
    nameInputStable: true,
    tagInputStable: true,
    tagValue: "牌",
    hasDeckTag: true,
    selectedTagVisible: true,
    optionsScrollable: true,
    maxHeight: "184px",
    overflowY: "auto",
    clientHeight: 30,
  });
  assert.equal(result.gameBrowser.tagOptionsInitial.expanded, "false");
  assert.equal(result.gameBrowser.tagOptionsInitial.label, "顯示更多");
  assert.match(result.gameBrowser.tagOptionsInitial.availableClass, /compact/);
  assert.match(result.gameBrowser.tagOptionsInitial.summary, /\d+ 個符合 · 共 \d+ 個標籤/);
  assert.ok(result.gameBrowser.tagOptionsInitial.clientHeight <= 65);
  assert.equal(result.gameBrowser.tagOptionsInitial.overflowY, "hidden");
  assert.equal(result.gameBrowser.tagOptionsInitial.hidden, false);
  assert.equal(result.gameBrowser.tagOptionsInitial.physicallyOverflowing, true);
  assert.deepEqual(result.gameBrowser.tagOptionsExpanded, {
    tagInputStable: true,
    expanded: "true",
    label: "收起",
    scrollable: true,
    maxHeight: "184px",
    overflowY: "auto",
    physicallyScrollable: true,
  });
  assert.deepEqual(result.gameBrowser.tagOptionsCollapsed, { expanded: "false", label: "顯示更多" });
  assert.deepEqual(result.gameBrowser.noOverflow, { physicallyOverflowing: false, moreHidden: true });
  assert.equal(result.gameBrowser.collapsed, true);
  assert.equal(result.gameBrowser.panelHidden, true);
  assert.equal(result.gameBrowser.reopened, true);
  assert.match(result.gameBrowser.initialRowToggle.label, /^＋\d+$/);
  assert.equal(result.gameBrowser.initialRowToggle.expanded, "false");
  assert.deepEqual(result.gameBrowser.expandedRowToggle, { label: "收起", expanded: "true" });
  assert.match(result.gameBrowser.collapsedRowToggle.label, /^＋\d+$/);
  assert.equal(result.gameBrowser.collapsedRowToggle.expanded, "false");
  assert.deepEqual(result.clearInteraction, {
    nameInputStable: true,
    selectedCount: 0,
    itemCount: 7,
  });
  assert.equal(result.animeBeforeSearch.value, "");
  assert.equal(result.animeAfterSearch.value, "星海");
  assert.equal(result.animeAfterSearch.resultCount, "1 筆結果");
  assert.equal(result.animeRailCount, 0);
  assert.equal(result.movieRailCount, 0);
  for (const resultForTitle of [result.animeTitleActions, result.movieTitleActions, result.liveActionTitleActions]) {
    assert.equal(resultForTitle.copied, resultForTitle.title);
    assert.equal(resultForTitle.opened, `https://www.google.com/search?q=${encodeURIComponent(resultForTitle.title)}`);
  }
  assert.equal(result.animeTitleActions.toast, "已複製作品名稱");
  assert.equal(result.liveActionTitleActions.imdbButton, "開啟 IMDb");
  assert.deepEqual(result.liveAction, {
    itemCount: 3,
    hideCount: 3,
    regionOptions: ["all", "日劇", "韓劇"],
    koreanCount: 2,
    searchCount: 1,
  });

  assert.deepEqual(result.titleActions.afterCopy, {
    copyCalls: ["銀河灰暗角落\nNonentity Galaxy"],
    openCalls: 0,
    toast: "已複製遊戲名稱",
    label: "複製 銀河灰暗角落 的中英文名稱",
    title: "複製中英文名稱",
    width: 28,
    height: 28,
  });
  assert.deepEqual(result.titleActions.focus, { active: true, outlineStyle: "solid", outlineWidth: "2px" });
  assert.equal(result.titleActions.hover.hovered, true);
  assert.notEqual(result.titleActions.hover.color, "rgb(122, 128, 125)");
  assert.notEqual(result.titleActions.hover.borderColor, "rgba(0, 0, 0, 0)");
  assert.notEqual(result.titleActions.hover.backgroundColor, "rgba(0, 0, 0, 0)");
  assert.equal(result.titleActions.afterOpen.copyCalls, 1);
  assert.deepEqual(result.titleActions.afterOpen.openCalls, [["https://store.steampowered.com/app/3129930"]]);
  assert.equal(result.clearHover.background, "rgba(0, 0, 0, 0)");
  assert.equal(result.clearHover.hovered, true);
  assert.equal(result.clearLeave.hovered, false);
  assert.equal(result.clearLeave.haloOpacity, "0");
  assert.equal(result.clearHover.haloOpacity, "1");
  assert.equal(result.clearHover.haloRadius, "50%");
  assert.equal(result.clearHover.haloTransform, "matrix(1, 0, 0, 1, 0, 0)");
  assert.deepEqual(result.clearButton.before, { hidden: false, label: "清除搜尋", title: null, width: 42, height: 38 });
  assert.deepEqual(result.clearButton.after, {
    value: "", focused: true, hidden: true, resultCount: "7 筆結果",
  });
  assert.equal(result.restoredGameSearch.value, "你有餅嗎？");
  assert.deepEqual(result.cleared, {
    value: "", focused: true, selectionStart: 0, selectionEnd: 0, resultCount: "7 筆結果",
  });
  assert.deepEqual(result.responsiveLayout.columnsAt900, { games: 3, anime: 3, movies: 3 });
  assert.deepEqual(result.responsiveLayout.resizeBehavior, {
    sameWidthKeepsRow: true,
    sameWidthKeepsInput: true,
    desktopTagCount: 6,
    mobileTagCount: 3,
  });
  assert.ok(result.responsiveLayout.tapTargets.tag.width >= 44);
  assert.ok(result.responsiveLayout.tapTargets.clearSearch.width >= 44);
  assert.ok(result.responsiveLayout.tapTargets.clearSearch.height >= 44);
  assert.ok(result.responsiveLayout.tapTargets.tag.height >= 44);
  assert.ok(result.responsiveLayout.tapTargets.expand.width >= 44);
  assert.ok(result.responsiveLayout.tapTargets.expand.height >= 44);
  assert.ok(result.responsiveLayout.tapTargets.panelClose.width >= 44);
  assert.ok(result.responsiveLayout.tapTargets.panelClose.height >= 44);
  assert.ok(result.responsiveLayout.tapTargets.tagOptionsToggle.width >= 44);
  assert.ok(result.responsiveLayout.tapTargets.tagOptionsToggle.height >= 44);
  assert.ok(result.responsiveLayout.tapTargets.copyTitle.width >= 44);
  assert.ok(result.responsiveLayout.tapTargets.copyTitle.height >= 44);
  assert.deepEqual(result.largeGameBatch.initial, { itemCount: 50, hasOpenAll: false, hasFallback: true });
  assert.deepEqual(result.largeGameBatch.afterFirstAppend, { itemCount: 100, firstNodePreserved: true, fiftiethNodePreserved: true });
  assert.deepEqual(result.largeGameBatch.afterSecondAppend, { itemCount: 150, firstNodePreserved: true, fiftiethNodePreserved: true });
  assert.deepEqual(result.largeGameBatch.afterFilter, { itemCount: 50, resultCount: "1000 筆結果" });
  assert.equal(result.largeGameBatch.oversizedOpen.calls, 0);
  assert.equal(result.largeGameBatch.oversizedOpen.buttonExists, false);
  assert.equal(result.largeGameBatch.oversizedOpen.toast, "");
  assert.deepEqual(result.largeGameBatch.horizontalOverflow, { desktop: false, mobile: false });
  assert.deepEqual(result.coverUpdate.initial, { requestCount: 1, firstRequestSize: 50, itemCount: 50 });
  assert.deepEqual(result.coverUpdate.afterUpdate, { firstRowPreserved: true, itemCount: 50, hasLoadedCover: true });
  assert.deepEqual(result.coverUpdate.backdropDismiss, { opened: true, imageKeepsOpen: true, closedFromBackdrop: true });
});
