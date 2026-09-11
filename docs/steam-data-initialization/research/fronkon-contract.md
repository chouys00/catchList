# FronkonGames 資料契約

## 固定輸入

- 資料集：`FronkonGames/steam-games-dataset` 的 `games.csv`
- 固定 revision：`4a166081a2b458f8e874d08c1acea98df991c6d5`
- 固定下載網址：`https://huggingface.co/datasets/FronkonGames/steam-games-dataset/resolve/4a166081a2b458f8e874d08c1acea98df991c6d5/games.csv?download=true`
- 驗證日期：2026-09-08
- 位元組數：401,140,503
- SHA-256：`1b48008b01a799d82385d6e66ba0cb65dd477b6aa4b6c2ec8c443025ab6880ad`
- 格式：UTF-8 CSV，首列為標頭，欄位以 RFC 4180 方式處理引號、逗號與換行。

這個 revision 是不可變的版本識別。A2 必須拒絕 revision、大小或 SHA-256 任一不符的檔案，不得在驗證後自動改用資料集的最新分支。

## 欄位結構

原始標頭依序為：

```text
AppID,Name,Release date,Estimated owners,Peak CCU,Required age,Price,DiscountDLC count,About the game,Supported languages,Full audio languages,Reviews,Header image,Website,Support url,Support email,Windows,Mac,Linux,Metacritic score,Metacritic url,User score,Positive,Negative,Score rank,Achievements,Recommendations,Notes,Average playtime forever,Average playtime two weeks,Median playtime forever,Median playtime two weeks,Developers,Publishers,Categories,Genres,Tags,Screenshots,Movies
```

| 初始化欄位 | FronkonGames 欄位 | A1 判定 |
| --- | --- | --- |
| AppID | `AppID` | 必填，純數字且可作為 Steam 路徑。 |
| 發行日 | `Release date` | 第一輪來源；無法解析則列資料缺失。 |
| 第一輪正負評 | `Positive`、`Negative` | 僅用於初篩；`0/0` 或非整數為資料缺失。 |
| 第一輪類型 | `Categories`、`Genres`、`Tags` | 保留原始值與正規化值；第二輪以商店頁標籤為主。 |
| 語言 | `Supported languages` | 初篩輔助資料，最終值由商店頁語言表取得。 |
| 價格 | `Price` | 不可單獨判定免費，`0` 可能是缺值。 |
| 名稱 | `Name` | 僅作候選識別，繁中名稱以商店頁為準。 |

## 分批載入結論

固定網址支援 HTTP Range。實測 `Range: bytes=0-65535` 回應為 `206`、`Content-Range: bytes 0-65535/401140503`，且收到 65,536 位元組。A2 可採串流 CSV 剖析逐列處理，不必把 401 MB 文字一次載入記憶體。

不可以任意位元組位置直接開始解析 CSV，因為引號欄位可能跨行。若要斷點續跑，必須保存已驗證的列邊界或使用能辨識 CSV 引號狀態的串流剖析器。