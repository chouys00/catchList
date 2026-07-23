# CatchList 共用 Google Drive 資料夾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將公司端 CatchList 報告安全切換到「我的雲端硬碟」內的共用 `CatchList` 資料夾，並產出家裡端設定 prompt。

**Architecture:** 以 `G:\我的雲端硬碟\CatchList` 作為唯一共用資料來源。先複製並驗證三份報告，再切換各專案輸出路徑；舊的 `D:\GoogleDrive_Sync` 保留作為回復來源。

**Tech Stack:** Windows、Google Drive for desktop、PowerShell、Node.js ES modules、npm workspaces

## Global Constraints

- 所有對話、計畫與文件使用繁體中文。
- 不刪除或移動 `D:\GoogleDrive_Sync` 的舊檔。
- 遷移前後都以 SHA-256 驗證三份 Markdown。
- 不執行耗時且會存取外部 API 的 `npm run update:all`。

---

### Task 1: 建立並填入共用資料夾

**Files:**
- Create: `G:\我的雲端硬碟\CatchList\動畫.md`
- Create: `G:\我的雲端硬碟\CatchList\電影.md`
- Create: `G:\我的雲端硬碟\CatchList\遊戲.md`

**Interfaces:**
- Consumes: `D:\GoogleDrive_Sync` 內三份現有報告
- Produces: 內容完全相同的共用雲端報告

- [ ] **Step 1: 再次確認目的資料夾不存在或為空**

Run:

```powershell
Test-Path -LiteralPath 'G:\我的雲端硬碟\CatchList'
```

Expected: `False`，或資料夾存在但三個目的檔都不存在。

- [ ] **Step 2: 建立資料夾並複製三份報告**

```powershell
New-Item -ItemType Directory -Path 'G:\我的雲端硬碟\CatchList'
Copy-Item -LiteralPath 'D:\GoogleDrive_Sync\動畫.md' -Destination 'G:\我的雲端硬碟\CatchList\動畫.md'
Copy-Item -LiteralPath 'D:\GoogleDrive_Sync\電影.md' -Destination 'G:\我的雲端硬碟\CatchList\電影.md'
Copy-Item -LiteralPath 'D:\GoogleDrive_Sync\遊戲.md' -Destination 'G:\我的雲端硬碟\CatchList\遊戲.md'
```

- [ ] **Step 3: 驗證來源與目的 SHA-256**

Run:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\GoogleDrive_Sync\動畫.md','D:\GoogleDrive_Sync\電影.md','D:\GoogleDrive_Sync\遊戲.md','G:\我的雲端硬碟\CatchList\動畫.md','G:\我的雲端硬碟\CatchList\電影.md','G:\我的雲端硬碟\CatchList\遊戲.md'
```

Expected: 每個同名檔案的兩個雜湊一致。

### Task 2: 切換三個專案輸出路徑

**Files:**
- Modify: `spiderMAL/.cursor/skills/find-anime/lib/constants.js`
- Modify: `imdb_tracker/config.js`
- Modify: `steam_discovery/config.js`

**Interfaces:**
- Consumes: `G:\我的雲端硬碟\CatchList`
- Produces: 三個更新器的新輸出位置

- [ ] **Step 1: 將動畫路徑改為共用位置**

```js
export const TARGET_PATH = 'G:/我的雲端硬碟/CatchList/動畫.md';
```

- [ ] **Step 2: 將電影路徑改為共用位置**

```js
OUTPUT_FILE: "G:/我的雲端硬碟/CatchList/電影.md",
```

- [ ] **Step 3: 將遊戲路徑改為共用位置**

```js
OUTPUT_FILE: "G:/我的雲端硬碟/CatchList/遊戲.md",
```

- [ ] **Step 4: 驗證所有執行路徑已切換**

Run:

```powershell
rg -n --hidden "D:/GoogleDrive_Sync|G:/我的雲端硬碟/CatchList" spiderMAL imdb_tracker steam_discovery
```

Expected: 實際執行用的三個設定都指向 `G:/我的雲端硬碟/CatchList`；文件內的歷史說明不影響執行。

### Task 3: 驗證程式與 Google Drive 狀態

**Files:**
- No file changes

**Interfaces:**
- Consumes: 已修改的三個設定與已複製的報告
- Produces: 可交付的公司端同步狀態

- [ ] **Step 1: 驗證 Node.js 能載入三個新設定**

Run:

```powershell
node --input-type=module -e "import { CONFIG as m } from './imdb_tracker/config.js'; import { CONFIG as g } from './steam_discovery/config.js'; import { TARGET_PATH as a } from './spiderMAL/.cursor/skills/find-anime/lib/constants.js'; console.log(a, m.OUTPUT_FILE, g.OUTPUT_FILE)"
```

Expected: 輸出三個 `G:/我的雲端硬碟/CatchList/*.md` 路徑。

- [ ] **Step 2: 確認目的檔可讀且 Google Drive 無待上傳錯誤**

Run:

```powershell
Get-Item -LiteralPath 'G:\我的雲端硬碟\CatchList\動畫.md','G:\我的雲端硬碟\CatchList\電影.md','G:\我的雲端硬碟\CatchList\遊戲.md'
```

Expected: 三份檔案都存在且大小大於零。

- [ ] **Step 3: 將 `CatchList` 設為可離線使用**

在檔案總管內對 `G:\我的雲端硬碟\CatchList` 使用 Google Drive 的「可離線使用」操作，重新讀取畫面確認狀態。

### Task 4: 產出家裡端 prompt

**Files:**
- No file changes

**Interfaces:**
- Consumes: 公司端實際共用路徑與驗證結果
- Produces: 可直接貼到家裡 Codex 的繁體中文 prompt

- [ ] **Step 1: prompt 明確要求唯讀檢查後再設定**

prompt 必須先檢查家裡端 Google Drive for desktop 是否執行、登入同一帳號，以及「我的雲端硬碟\CatchList」是否存在。

- [ ] **Step 2: prompt 要求離線與同步驗證**

prompt 必須要求將資料夾設為可離線使用，並驗證三份檔案可讀、非唯讀、同步完成，不得改動檔案內容。

- [ ] **Step 3: prompt 要求回報**

prompt 必須要求回報實際本機路徑、三份檔案狀態與任何尚未完成的步驟。
