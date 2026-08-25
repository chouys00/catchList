# Steam 社群標籤與遊戲分頁改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 使用者已要求本輪不得提交，所有原本應執行的 commit 步驟改為檢查未提交差異。

**Goal:** 為最終入選遊戲補抓 Steam 繁中社群標籤，並將閱讀器遊戲分頁改為可跨月份、以完整標籤組合篩選的清單。

**Architecture:** `steam_discovery` 以獨立 sidecar 保存社群標籤，避免改寫 Markdown 報告；`catchlist_reader` 載入報告後依 AppID 合併 sidecar。介面只讓遊戲分頁改用跨月份篩選狀態與標籤工作區，動畫、電影沿用現有路徑。

**Tech Stack:** Node.js ES modules、node:test、Electron、原生 HTML/CSS/JavaScript、Steam 商店 HTML、`@catchlist/core` HTTP 重試與 JSON 工具

**Spec:** `docs/superpowers/specs/2026-08-24-steam-tag-browser-design.md`

## Global Constraints

- 所有改動只留在 `codex/steam-community-tags` 工作樹，禁止執行 `git commit`、`git push` 或建立 PR。
- 不寫入或改動 `G:\我的雲端硬碟\CatchList\遊戲.md` 與同資料夾的正式 sidecar。
- `遊戲.md` 繼續作為遊戲清單與月份完成狀態來源。
- 社群標籤使用 `tchinese`，每款最多保存 Steam 頁面提供的前 20 個非空標籤。
- 多標籤篩選採全部符合（AND）；動畫與電影分頁行為不可改變。
- 實作與錯誤訊息使用臺灣繁體中文。

## File Structure

- Create: `steam_discovery/community-tags.js`：解析 Steam 商店頁標籤、驗證 sidecar、原子保存與缺漏補抓。
- Create: `steam_discovery/test/community-tags.test.js`：標籤解析、去重、快取續跑與失敗保留測試。
- Modify: `steam_discovery/fetcher.js`：提供單款遊戲商店頁 HTML 請求。
- Modify: `steam_discovery/main.js`：最終入選後補抓標籤並支援既有資料初始化。
- Modify: `steam_discovery/package.json`：將正式單元測試接到 `npm test`。
- Modify: `catchlist_reader/src/library.js`：讀取、驗證並合併 `遊戲標籤.json`。
- Modify: `catchlist_reader/test/library.test.js`：sidecar 合併、缺漏與損壞測試。
- Modify: `catchlist_reader/src/renderer/game-browser.js`：集中遊戲篩選、排序、標籤統計與顯示標籤選取規則。
- Create: `catchlist_reader/test/game-browser.test.js`：遊戲跨月份與標籤 AND 篩選單元測試。
- Modify: `catchlist_reader/src/renderer/item-template.js`：輸出可互動標籤與單列展開按鈕。
- Modify: `catchlist_reader/test/item-template.test.js`：遊戲列完整標籤與備援類型標記測試。
- Modify: `catchlist_reader/src/renderer/app.js`：改用遊戲專用狀態、工具列、標籤面板與局部更新事件。
- Modify: `catchlist_reader/test-support/renderer-search-harness.cjs`：補齊標籤與 select 互動所需 DOM 測試能力。
- Modify: `catchlist_reader/test/renderer-search.test.js`：搜尋游標不回歸、標籤操作、清除與展開測試。
- Modify: `catchlist_reader/src/renderer/styles.css`：遊戲全寬版面、密集標籤面板及三種尺寸響應式樣式。
- Modify: `catchlist_reader/src/tauri-shell/library.js`：同步遊戲 entry 的 `tags` 資料形狀。
- Modify: `catchlist_reader/src/tauri-shell/main.js`：同步遊戲跨月份基本篩選與標籤顯示。
- Modify: `catchlist_reader/src/tauri-shell/styles.css`：同步遊戲全寬基本版面。
- Modify: `catchlist_reader/test/tauri-shell.test.js`：驗證 Tauri 靜態殼的資料形狀與基本畫面。
- Create: `catchlist_reader/test-data/steam-tags-2026-02/遊戲.md`：隔離的 2026 年 2 月 7 款驗收清單。
- Create: `catchlist_reader/test-data/steam-tags-2026-02/遊戲標籤.json`：7 款遊戲各 17～20 個實測標籤。

---

### Task 1: Steam 社群標籤 sidecar

**Files:**
- Create: `steam_discovery/community-tags.js`
- Create: `steam_discovery/test/community-tags.test.js`
- Modify: `steam_discovery/fetcher.js`
- Modify: `steam_discovery/package.json`

**Interfaces:**
- Consumes: `getWithRetry(url, requestOptions, retryOptions)`、`delay(ms)`。
- Produces: `parseCommunityTags(html): string[]`、`loadTagStore(filepath): TagStore`、`saveTagStore(filepath, store): void`、`backfillCommunityTags({ appids, filepath, fetchTags, wait }): Promise<{ fetched: number, skipped: number, failed: string[] }>`、`fetchCommunityTags(appid): Promise<string[] | null>`。

- [ ] **Step 1: 寫入會失敗的 HTML 解析與 sidecar 測試**

```js
test("解析繁中社群標籤並保留 Steam 排序", () => {
  const html = `<a class="app_tag"> 類 Rogue 牌組製作 </a><a class="app_tag">烹飪</a><a class="app_tag">烹飪</a>`;
  assert.deepEqual(parseCommunityTags(html), ["類 Rogue 牌組製作", "烹飪"]);
});

test("只補抓缺漏 AppID，單筆失敗不覆寫成功資料", async () => {
  const result = await backfillCommunityTags({
    appids: ["3205380", "3300800", "bad"], filepath,
    fetchTags: async (appid) => appid === "3300800" ? null : ["烹飪"],
    wait: async () => {}, now: () => "2026-08-24T00:00:00.000Z",
  });
  assert.deepEqual(result, { fetched: 0, skipped: 1, failed: ["3300800"] });
  assert.deepEqual(loadTagStore(filepath).games["3205380"].tags, ["既有標籤"]);
});
```

- [ ] **Step 2: 執行測試並確認因模組尚不存在而失敗**

Run: `node --test steam_discovery/test/community-tags.test.js`

Expected: FAIL，錯誤指出找不到 `community-tags.js` 或匯出函式。

- [ ] **Step 3: 實作解析、驗證及每筆成功後原子寫入**

```js
export function parseCommunityTags(html) {
  const tags = [];
  for (const match of String(html).matchAll(/<a[^>]*class="[^"]*app_tag[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const tag = decodeHtml(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length === 20) break;
  }
  return tags;
}
```

`loadTagStore` 對不存在、`version !== 1`、非物件 `games` 回傳 `{ version: 1, locale: "tchinese", games: {} }`；只接受 `/^\d+$/` AppID 與非空字串標籤。`saveTagStore` 先寫同資料夾暫存檔，再 `renameSync` 取代目標。`backfillCommunityTags` 先去除非法及重複 AppID，已有非空標籤者計入 `skipped`，每筆成功立即保存，兩次實際請求間呼叫 `wait(1500)`。

`fetched` 只計算本輪實際向 Steam 取得並成功寫入的新項目；快取命中只計入 `skipped`，兩者不得重複計數。

- [ ] **Step 4: 在 fetcher 提供商店頁請求**

```js
export async function fetchCommunityTags(appid) {
  try {
    const response = await getWithRetry(`https://store.steampowered.com/app/${appid}`, {
      params: { cc: "tw", l: "tchinese" }, headers: STEAM_HEADERS, timeout: 15000,
    }, { label: `community tags ${appid}` });
    const tags = parseCommunityTags(response.data);
    return tags.length ? tags : null;
  } catch (error) {
    console.error(`  [Fetcher] 社群標籤 (${appid}) 取得失敗：${error.message}`);
    return null;
  }
}
```

- [ ] **Step 5: 將 package 測試指令改為正式測試並執行**

Run: `npm test --workspace steam_discovery`

Expected: PASS，無網路請求。

- [ ] **Step 6: 確認改動仍未提交**

Run: `git status --short --branch`

Expected: `community-tags.js` 與測試為未提交變更，沒有新增 commit。

### Task 2: 更新流程與可續跑初始化

**Files:**
- Modify: `steam_discovery/main.js`
- Modify: `steam_discovery/config.js`
- Create: `steam_discovery/test/main-tags.test.js`
- Modify: `steam_discovery/package.json`

**Interfaces:**
- Consumes: Task 1 的 `backfillCommunityTags`、`fetchCommunityTags`。
- Produces: `resolveTagFile(reportFile): string`、`extractReportAppids(content): string[]`、命令列選項 `--backfill-tags`。

- [ ] **Step 1: 寫入路徑及 AppID 擷取測試**

```js
test("sidecar 與遊戲報告放在同一資料夾", () => {
  assert.equal(resolveTagFile("D:/data/遊戲.md"), path.resolve("D:/data/遊戲標籤.json"));
});

test("初始化會去重並只接受 Steam app URL", () => {
  const markdown = "https://store.steampowered.com/app/3205380\nhttps://store.steampowered.com/app/3205380\n";
  assert.deepEqual(extractReportAppids(markdown), ["3205380"]);
});
```

- [ ] **Step 2: 執行測試並確認新介面尚未實作**

Run: `node --test steam_discovery/test/main-tags.test.js`

Expected: FAIL，缺少 `resolveTagFile` 或 `extractReportAppids`。

- [ ] **Step 3: 抽出純函式並串接每月入選結果**

完成 `appdetails` 驗證後，以 `acceptedGames.map(game => game.appid)` 呼叫 `backfillCommunityTags`，成功或失敗都不改變入選清單；標籤補抓完成後才執行既有 `updateReport`。sidecar 路徑固定由 `path.join(path.dirname(reportFile), "遊戲標籤.json")` 產生。

- [ ] **Step 4: 實作 `--backfill-tags` 初始化模式**

當選項存在時，只讀取既有 `遊戲.md`、擷取 AppID 並補抓缺漏標籤，不搜尋月份、不執行 `appdetails`、不重寫 Markdown。報告不存在時設 `process.exitCode = 1` 並顯示明確錯誤；個別標籤失敗時列出 AppID 並設非零 exit code，已成功項目保留供下次續跑。

- [ ] **Step 5: 執行 Steam 單元測試**

Run: `npm test --workspace steam_discovery`

Expected: PASS，測試以依賴注入替代實際 Steam 請求。

- [ ] **Step 6: 確認沒有寫入正式 G 槽檔案且沒有 commit**

Run: `git status --short --branch`

Expected: 只有工作樹內程式與測試變更。

### Task 3: 閱讀器載入並合併 sidecar

**Files:**
- Modify: `catchlist_reader/src/library.js`
- Modify: `catchlist_reader/test/library.test.js`
- Create: `catchlist_reader/test-data/steam-tags-2026-02/遊戲.md`
- Create: `catchlist_reader/test-data/steam-tags-2026-02/遊戲標籤.json`

**Interfaces:**
- Consumes: sidecar `{ version: 1, locale: "tchinese", games: Record<string, { tags: string[], fetchedAt: string }> }`。
- Produces: 遊戲 library 的每筆 entry 增加 `tags: string[]`；library 增加 `tagWarning: string | null`。

- [ ] **Step 1: 建立 2026 年 2 月 7 款隔離資料**

`遊戲.md` 使用現有正式格式；`遊戲標籤.json` 填入設計規格列出的 7 個 AppID 與已實測的 17～20 個繁中標籤，包含 `3205380` 的「類 Rogue 牌組製作」「烹飪」「牌組製作」。資料路徑只在工作樹內。

- [ ] **Step 2: 寫入合併、缺漏與損壞測試**

```js
test("依 AppID 合併完整社群標籤", () => {
  const game = loadLibrary(fixtureDir, "games").entries.find((entry) => entry.appid === "3205380");
  assert.equal(game.tags.length, 20);
  assert.ok(game.tags.includes("烹飪"));
});

test("sidecar 損壞時保留遊戲並提供非阻斷警告", () => {
  fs.writeFileSync(path.join(directory, "遊戲標籤.json"), "{broken", "utf8");
  const result = loadLibrary(directory, "games");
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.entries[0].tags, []);
  assert.match(result.tagWarning, /無法讀取/);
});
```

- [ ] **Step 3: 執行閱讀器資料測試並確認失敗**

Run: `node --test --experimental-test-isolation=none catchlist_reader/test/library.test.js`

Expected: FAIL，現有 entry 沒有 `tags` 或 `tagWarning`。

- [ ] **Step 4: 實作安全合併**

新增 `loadGameTags(dataDir)`，只解析 `遊戲標籤.json`；讀檔或驗證錯誤轉為 `{ games: {}, warning }`，不向上拋出。`loadLibrary(dataDir, "games")` 依 AppID 複製合法標籤至 `tags`；其他媒體不讀 sidecar，entry 形狀不變。

- [ ] **Step 5: 執行閱讀器資料測試**

Run: `node --test --experimental-test-isolation=none catchlist_reader/test/library.test.js`

Expected: PASS，7 款 fixture 都有 17～20 個標籤，缺漏及損壞時仍載入清單。

### Task 4: 遊戲篩選、排序與標籤列

**Files:**
- Create: `catchlist_reader/src/renderer/game-browser.js`
- Create: `catchlist_reader/test/game-browser.test.js`
- Modify: `catchlist_reader/src/renderer/item-template.js`
- Modify: `catchlist_reader/test/item-template.test.js`

**Interfaces:**
- Consumes: 遊戲 entry 的 `title`、`originalTitle`、`year`、`month`、`releaseDate`、`score`、`reviews`、`genres`、`tags`。
- Produces: `filterAndSortGames(entries, filters): GameEntry[]`、`collectTagOptions(entries, selectedTags, query): { tag: string, count: number, selected: boolean }[]`、`visibleGameTags(entry, selectedTags, expanded, limit): { visible: string[], hiddenCount: number, fallback: boolean }`。

- [ ] **Step 1: 寫入跨月份、組合篩選與排序測試**

```js
test("標籤使用 AND 並依日期、好評率、評論數排序", () => {
  const result = filterAndSortGames(entries, {
    query: "", year: "all", month: "all", min: "90", tags: ["策略", "牌組製作"],
  });
  assert.deepEqual(result.map(({ appid }) => appid), ["newer", "older"]);
});

test("已選標籤優先，沒有 sidecar 時才顯示 genres", () => {
  assert.deepEqual(visibleGameTags(entry, ["牌組製作"], false, 3).visible[0], "牌組製作");
  assert.equal(visibleGameTags({ tags: [], genres: ["動作"] }, [], false, 3).fallback, true);
});
```

- [ ] **Step 2: 執行測試並確認模組尚不存在**

Run: `node --test --experimental-test-isolation=none catchlist_reader/test/game-browser.test.js`

Expected: FAIL，找不到 `game-browser.js`。

- [ ] **Step 3: 實作純函式**

`filterAndSortGames` 依名稱、年份、月份、最低好評率及 `filters.tags.every(tag => entry.tags.includes(tag))` 篩選；排序使用 `releaseDate` 降冪、`score` 降冪、`reviews` 降冪、繁中標題升冪。`collectTagOptions` 只統計非空 `tags`，已選項固定在前，再依 count 降冪及名稱升冪。`visibleGameTags` 將已選標籤移到前方，桌面限制 6、手機限制 3，展開時不截斷。

- [ ] **Step 4: 調整遊戲列模板**

`renderItemTemplate(entry, "games", view)` 接收 `{ selectedTags, expanded, tagLimit }`，輸出 `data-game-tag` 按鈕、`data-expand-tags` 的 `＋N` 按鈕；fallback 時輸出 genres 並顯示「尚未補齊社群標籤」。動畫與電影呼叫方式及快照保持不變。

- [ ] **Step 5: 執行純函式與模板測試**

Run: `node --test --experimental-test-isolation=none catchlist_reader/test/game-browser.test.js catchlist_reader/test/item-template.test.js`

Expected: PASS。

### Task 5: 遊戲分頁互動與響應式版面

**Files:**
- Modify: `catchlist_reader/src/renderer/app.js`
- Modify: `catchlist_reader/src/renderer/styles.css`
- Modify: `catchlist_reader/test-support/renderer-search-harness.cjs`
- Modify: `catchlist_reader/test/renderer-search.test.js`
- Modify: `catchlist_reader/src/tauri-shell/library.js`
- Modify: `catchlist_reader/src/tauri-shell/main.js`
- Modify: `catchlist_reader/src/tauri-shell/styles.css`
- Modify: `catchlist_reader/test/tauri-shell.test.js`

**Interfaces:**
- Consumes: Task 4 的三個純函式與支援 `view` 的 `renderItemTemplate`。
- Produces: 遊戲 filters `{ query, year, month, min, tags, tagsOpen, tagQuery }` 與 `expandedGameTags: Set<string>`。

- [ ] **Step 1: 寫入遊戲分頁 DOM 互動測試**

```js
test("遊戲分頁預設跨月份且沒有月份側欄", async () => {
  const page = await createHarness({ active: "games", library: gamesWithTags });
  assert.equal(page.document.querySelector(".rail"), null);
  assert.equal(page.document.querySelectorAll(".item.games").length, gamesWithTags.entries.length);
});

test("標籤選取、搜尋、收合及清除不重建名稱輸入框", async () => {
  const input = page.document.querySelector('[data-filter="query"]');
  input.value = "你有餅";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(page.document.querySelector('[data-filter="query"]'), input);
  await click('[data-game-tag="牌組製作"]');
  assert.match(page.document.querySelector('[data-action="toggle-tags"]').textContent, /1/);
  await click('[data-action="clear-filters"]');
  assert.equal(page.document.querySelectorAll("[data-selected-tag]").length, 0);
});
```

- [ ] **Step 2: 執行互動測試並確認現有月份導覽造成失敗**

Run: `node --test --experimental-test-isolation=none catchlist_reader/test/renderer-search.test.js`

Expected: FAIL，仍有 `.rail`、缺少標籤按鈕或 filters 欄位。

- [ ] **Step 3: 改造遊戲專用 render 與局部更新**

移除遊戲的 `newestPeriod` 初始化與 `data-period` 事件。遊戲 `render()` 使用全寬 `.layout.games-layout`；工具列加入年份、月份、最低好評率、標籤數及清除。名稱與標籤搜尋 `input` 只更新結果區或標籤面板，不重建正在輸入的元素；select、標籤選取、收合、`＋N` 展開可重繪相關區域。`open-filtered` 文字改為「開啟目前結果」，不再提及本月。

- [ ] **Step 4: 顯示非阻斷 sidecar 警告**

遊戲 library 的 `tagWarning` 有值時，在 section status 下顯示可閱讀但不阻斷的提示；缺少單筆標籤只在該列顯示 fallback 訊息。

- [ ] **Step 5: 套用遊戲專用視覺樣式**

桌面遊戲列維持封面、主資訊、評價與日期、標籤、動作的橫列；標籤為方角低對比按鈕，選取時使用現有萊姆綠。`max-width: 900px` 時縮小欄位；`max-width: 560px` 時工具列單欄、標籤面板頁內展開、遊戲列改堆疊並以 CSS／JS 限制預設 3 個標籤。動畫與電影的 `.layout`、`.rail` 不修改。

- [ ] **Step 6: 同步 Tauri 靜態殼的基本遊戲畫面**

Tauri 靜態殼同步讀取遊戲 `tags`，遊戲分頁預設不鎖定最新月份，並顯示完整標籤或 genres 備援；Electron 的標籤面板與列展開互動仍是正式完整版本。`tauri-shell.test.js` 必須驗證遊戲資料含 `tags`、基本畫面沒有遊戲月份側欄，且動畫與電影解析不變。

- [ ] **Step 7: 執行完整閱讀器測試**

Run: `npm run reader:test`

Expected: 全部 PASS，既有搜尋 Backspace／游標測試仍通過。

### Task 6: 真實資料與視覺驗收

**Files:**
- Verify only: `catchlist_reader/test-data/steam-tags-2026-02/*`
- Verify only: `catchlist_reader/src/renderer/*`

**Interfaces:**
- Consumes: 完成的 Electron 閱讀器與隔離 fixture。
- Produces: 桌面、中尺寸、手機尺寸的操作驗證結果，不保留 Playwright 暫存產物。

- [ ] **Step 1: 執行全部自動測試**

Run: `npm test --workspace steam_discovery`

Expected: PASS。

Run: `npm run reader:test`

Expected: PASS。

- [ ] **Step 2: 啟動 Electron 並指定隔離 fixture**

Run: `npm run reader:dev`

在應用程式內選擇 `D:\練習\CatchList\.worktrees\steam-community-tags\catchlist_reader\test-data\steam-tags-2026-02`，不得選擇正式 G 槽資料夾。

- [ ] **Step 3: 以 Playwright 驗證三種視窗尺寸**

逐一檢查 1440×900、900×700、390×844：沒有水平溢位；7 款遊戲可見；「你有餅嗎？」預設顯示 6／3 個標籤；`＋N` 能展開；「牌組製作」與「輕度 Rogue」同選時採 AND；年份、月份、最低好評率及名稱可組合；Backspace 連續刪除時輸入框節點與游標不重置。

- [ ] **Step 4: 清理瀏覽器驗收產物並檢查差異**

刪除工作樹內 `.playwright-cli` 暫存截圖與 session；不得刪除程式、測試或 fixture。執行：

Run: `git status --short --branch`

Expected: 所有規格、計畫、程式、測試與 fixture 都顯示為未提交；分支沒有新 commit。

- [ ] **Step 5: 交給使用者手動驗收**

保持 Electron 開發版執行，回報實際測試通過數、啟動中的工作樹路徑、正式 G 槽未改動，以及可用 `git status` 檢視並一次回退全部未提交改動。
