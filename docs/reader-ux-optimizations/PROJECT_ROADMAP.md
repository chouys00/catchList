# 閱讀器三階段優化
plan_revision：1。順序 C1 → C2 → C3；同一 Local checkout、三個新對話、循序執行，無子代理。整段授權見 DECISIONS.md。
## C1：動畫搜尋的封面載入
需求：REQ-001、REQ-004、REQ-005。前置：核對本輪狀態、原檔與已安裝技能。
成果：局部修正 app.js／anime-media-ui.js（依實際需要）、對應 renderer 回歸測試。
方向：搜尋重建列表後，重新連接動畫媒體載入；保留快取與去重，不在每次搜尋直接重抓所有封面。
必要測試：搜尋一部原先未進可視區的動畫，確認真的觸發 resolver，顯示結果；清除搜尋與重複搜尋仍可用。使用隔離資料與網路 stub，維持既有互動。
完成條件：相關測試通過，自我檢查；依 AGENTS 遞增 patch、重建 portable、驗證雲端檔案雜湊再清理授權範圍內舊版；accepted／PASS 並建立 C2 新對話。
並行：循序。人工驗收：none。風險：重複 observer／請求或過時回應。
模型需求：economy；已明確指定 gpt-6-luna／high。
### C1 執行結果
狀態：accepted；放行：PASS。
實作：`app.js` 的局部搜尋／清除結果重建後重新掛接 AnimeMediaUI observer；原有媒體快取、延遲載入及佇列去重不變。Electron fixture 加入 41 筆隔離作品，目標作品初始位於可視區外。
實際驗證：`npm test --workspace catchlist_reader -- --test-name-pattern="動畫封面、影片、作品校正"` 通過（退出碼 0）；`npm run reader:build` 的 release guard 通過、`npm test` 122/122 通過，之後 `npm run build:portable --workspace catchlist-reader --ignore-scripts` 打包完成（退出碼 0）；`git diff --check` 通過。
互動證據：搜尋前底部目標未請求；搜尋後確實呼叫 resolver 並顯示封面及影片；清除後還原完整清單，重複搜尋沿用快取且沒有第二次請求。隔離測試使用 Electron renderer 與 stub IPC／圖片，不接觸正式資料。
發行：版本 1.0.47；`D:\練習\CatchList\catchlist_reader\dist\CatchListReader-1.0.47-portable.exe`，SHA-256 `ABFBF9EAAC251880D1F2CBC544897569F7ECCAF1EDA7E41ACAFC9F65889E2220`；已複製至 `G:\我的雲端硬碟\CatchList\CatchListReader-1.0.47-portable.exe` 並確認雜湊相同。同步資料夾只留此最新閱讀器；Google Drive 雲端上傳狀態未確認。
保留證據：啟動前六個未提交檔案中，`src/library.js`、`src/tauri-shell/library.js`、`src/legacy-game-tags.js`、`test/legacy-game-tags.test.js` 的 SHA-256 與 baseline 相同；`package.json` 與 lock 僅更新閱讀器版本至 1.0.47。未修改正式報告、個人紀錄或其他專案；無 commit／push。
工作區：HEAD `1f26beee39af495d35d084844f22400886955c90`，分支 `codex/reader-ux-optimizations`；保留所有既有未提交內容，另有本階段 renderer 與互動測試改動。
## C2：各媒體捲動位置
需求：REQ-002、REQ-004、REQ-005。前置：C1 accepted／PASS 與成果證據。
成果：頁面切換時保存與恢復捲動位置，新增實際 renderer 測試。
必要測試：首次進入另一媒體為頂端；切回恢復各自位置；遊戲超過首批顯示範圍仍能恢復；頁面較短、篩選後及快速非同步切換不套用過時位置。驗證 C1 的搜尋封面回歸。
完成條件：測試與自我檢查通過，完成本階段 patch／portable／同步；accepted／PASS 並建立 C3 新對話。
並行：循序。人工驗收：none。風險：捲動時機、分批載入及非同步切換競爭。
模型需求：balanced；已明確指定 gpt-6.1-sol／medium。
### C2 執行結果
狀態：accepted；放行：PASS。
實作：app.js 以視窗記憶體保存四種媒體位置與遊戲已載入筆數；媒體切換立即重建目的頁並恢復位置，載入完成保留等待期間的新位置。遊戲先恢復已載入批次，必要時持續補載至足夠高度；較短清單由瀏覽器截到有效範圍。每次載入有遞增請求識別碼，A→B→A 的舊回應與錯誤不套用；舊 sentinel 回呼不得追加新頁清單。
實際驗證：新增 media-scroll-workflows.cjs／.test.js，隔離 Electron 實測四媒體首次到頂與各自恢復、200 列以上遊戲恢復、搜尋篩選保留、來源縮短、載入期間捲動、同媒體過時回應、桌面／窄視窗變高後補載。局部 C2 測試退出碼 0；C1 動畫搜尋封面回歸通過；npm run reader:build 退出碼 0，release guard 通過，123/123 測試通過，portable 成功建置。git diff --check 通過。
初次測試遭 spawn EPERM，提升執行權限後可測；fixture 缺 IMDb 欄位與視窗尺寸等待不足造成兩次失敗，修正 fixture 後局部及完整測試均通過，沒有把失敗列為成功。
發行：1.0.48；D:/練習/CatchList/catchlist_reader/dist/CatchListReader-1.0.48-portable.exe（94,777,617 bytes）；G:/我的雲端硬碟/CatchList/CatchListReader-1.0.48-portable.exe。兩者 SHA-256：6C6F8219C76E90A386431B71E146D3CE8FDD8E467D3300A42150F8D99031585C。已確認舊版 1.0.47 不存在，新版存在；保留本機 dist 歷史，Google Drive 雲端上傳未確認。
既有影響：原有四個使用者檔案 SHA-256 與 baseline 相符；package／lock 僅依規則升版。正式報告與個人紀錄未修改，未執行連網更新、commit 或 push。捲動位置限同一視窗工作階段，重新開啟歸零。
技能驗證偏差：首次控制檔寫入 EPERM，當時同一工具批次仍執行第一筆 app.js 修改，未遵守「先 claimed 再實作」。第二次寫入被自動核准以人類授權證據不足拒絕；實際讀取來源對話 userMessage（原始指示及模型選擇）後重試獲准，再因 reparse point 改用已核准的提升權限寫入，登記 claimed／in_progress。這是執行順序偏差，不能宣稱 C2 接手流程完全通過；沒有其他寫入者、資料損失或功能阻擋。後續 C3 須確認 claimed 寫入成功才開始實作，失敗時不得在同一批次接著修改程式。
工作區：HEAD 1f26beee39af495d35d084844f22400886955c90；分支 codex/reader-ux-optimizations；全部未提交內容保留。C2 新增 app.js 捲動／載入保護及兩個 Electron 測試檔，C1 及原使用者修改維持。

## C3：遊戲標籤局部更新與整體驗收
需求：REQ-003、REQ-004、REQ-005。前置：C2 accepted／PASS 與成果證據。
成果：只更新目標作品列；500 列實際 DOM 保留與展開／收合測試；三項整合證據、最終 portable 與完整回報。
必要測試：其餘列節點保留、顯示列數／封面／捲動位置保持，目標標籤展開收合、鍵盤操作、分批 sentinel 與後續載入仍可用。跑完整 npm run reader:test；版本 guard 與建置前置檢查由既有腳本處理。隔離實際 renderer 驗證三項情境、記錄操作時間與 DOM 保留結果；無須重跑無關資料更新。
完成條件：全套與整合測試通過；完成本階段 patch／portable／同步，保留原用戶修改與正式報告；整段 completed，next_stage=null，不建立 C4 或審查對話。
並行：循序。人工驗收：none。風險：事件委派、焦點、局部列狀態與封面非同步回應。
模型需求：balanced；已明確指定 gpt-6.1-sol／medium。
### C3 執行結果
狀態：accepted；放行：PASS。C1～C3 授權範圍完成，未建立 C4、審查 task 或子代理。
實作：遊戲標籤只更新目標列的 .game-tags 子節點，沿用原展開按鈕並恢復其焦點，保留整列與封面。保存並還原捲動位置，避免瀏覽器因標籤高度改變而自動偏移。renderGameTags 與原作品樣板共用，維持選取標籤、全部收錄與舊版類型備援規則。
實際驗證：新增 reader-ux-workflows.cjs／.test.js，以隔離 Electron renderer 測試 500 列；展開及 Enter 鍵收合後 500／500 列節點、500 張封面節點、原 sentinel、顯示數量及捲動位置均保留。焦點停留原按鈕，Steam 連結及封面視窗可操作，原 sentinel 自動載入至至少 550 列後原 500 列仍保留。同一 renderer 驗證四媒體首次到頂、切回恢復，搜尋原未可視動畫實際觸發 resolver 並呈現封面，清除／重複搜尋沿用快取。C1、C2 原有深入回歸測試也在全套通過。
操作量測：展開 3.00 ms，Enter 收合 2.50 ms，媒體切回 690.04 ms，動畫搜尋到圖片完成 1650.91 ms。後兩項含測試等待與非同步載入，只作本機量測，不設跨機器速度門檻。證據：output/reader-ux-optimizations-20261005/c3-integration.json。
測試結果：node --test catchlist_reader/test/reader-ux-workflows.test.js 退出碼 0；npm run reader:test 退出碼 0，124／124 通過（c3-full-test.log）；npm run release:guard --workspace catchlist-reader 退出碼 0；git diff --check 通過。完整測試後只調整 package／lock 版本欄位，未改產品程式或測試；npm run build:portable --workspace catchlist-reader --ignore-scripts 退出碼 0（c3-build.log），略過已完成前置測試的重複執行。
失敗與修正：首次 npm 傳參未將名稱篩選送至 Node，實際跑到全套且 Electron 因 spawn EPERM 失敗，未列為通過；後續提升權限。局部測試找到實際捲動偏移 23 px，已在產品修正。鍵盤替身補上 Chromium Enter 字元事件，動畫替身補齊資料並改用受支援圖片來源後測試通過。同步複製初次遭拒絕存取，提升權限後成功，未在失敗時清理舊版。
發行：1.0.49；D:/練習/CatchList/catchlist_reader/dist/CatchListReader-1.0.49-portable.exe（94,778,188 bytes）；G:/我的雲端硬碟/CatchList/CatchListReader-1.0.49-portable.exe。來源與目的 SHA-256 均為 5E435D0372C22A12AA4A74055F75AFAF09A72A5660570D07644292DA8A940A37；核對後才移除同步資料夾頂層舊 1.0.48。最終讀取曾再次看到舊檔，重新核對新版雜湊並再次限定清理後，已實際確認頂層只剩 1.0.49。保留本機 dist 歷史；Google Drive 實際上傳未確認。證據：c3-release.json。
完整性：原有 library.js、tauri-shell/library.js、legacy-game-tags.js、legacy-game-tags.test.js 雜湊仍與 baseline 相符。保留 C1、C2 與全部使用者未提交內容；未修改正式報告、個人紀錄或其他專案，無連網資料更新、commit 或 push。
技能驗證：三階段均完成產品工作且逐階段新對話接續，終點 C3 停止。C3 先查核原始 userMessage 授權，第一次 claimed 寫入拒絕後未修改實作；提升權限成功寫入並讀回自身 ID，再獨立切換 C3／in_progress 並檢查成功才改程式。C3 執行紀錄的 turn_context 已確認 gpt-6.1-sol／medium。C2「首次狀態寫入失敗後同批仍改實作」的偏差仍有效，本輪不能宣稱接手流程全部通過；未修改 SKILL 或自行加設新驗證階段。
工作區：HEAD 1f26beee39af495d35d084844f22400886955c90；分支 codex/reader-ux-optimizations。C3 新增兩個整合測試檔、修改 app.js／item-template.js 與版本欄位，全部保持未提交。



