# A1 驗證報告

- 執行日期：2026-09-08
- 階段：A1「確認資料契約與單頁可行性」
- 結果：PASS

## 已確認

1. FronkonGames `games.csv` 已固定至 revision `4a166081a2b458f8e874d08c1acea98df991c6d5`，完整串流 SHA-256 為 `1b48008b01a799d82385d6e66ba0cb65dd477b6aa4b6c2ec8c443025ab6880ad`，並支援 Range 與串流逐列載入。
2. 使用者已實測多款正常收錄且遠離門檻的遊戲，FronkonGames `positive`／`negative` 與同日 SteamSpy 完全一致。此資料可作為全球全語系終身評價與評論數的篩選依據；個別資料不是即時同步不構成阻擋。
3. 繁中臺灣商店頁可取得標題、發行日、語言表、社群標籤及免費、內購、MMO、VR、搶先體驗的正向訊號。年齡驗證與不完整 HTTP 200 一律待重試，硬性欄位不會轉為 false。
4. 繁中商店頁沒有全球全語系終身評價，因此該欄位固定使用 FronkonGames，絕不以最近評價或目前語言評價替代。

## Reviews API 邊界

固定樣本保留官方 Reviews API 的全語系回應作對照證據。它沒有加入初始化正式資料來源；是否日後另開複核工作，仍待使用者決定。

## 實際驗證

- `npm test --workspace steam_discovery`：32 項通過、0 項失敗。
- 抽樣商店頁：只讀取 `/app/{appid}?cc=tw&l=tchinese`。
- 初始化資料來源契約：只有 FronkonGames 與 `/app/{appid}`；不含搜尋頁或 `appdetails`。