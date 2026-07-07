// ============================================================
// config.js — Steam 遊戲發掘工具設定檔
// ============================================================

export const CONFIG = {
  // 輸出檔案名稱
  OUTPUT_FILE: "D:/GoogleDrive_Sync/遊戲.md",

  // 沉澱期（月）：往前推 N 個月以前上市的遊戲才列入考慮（確保評價有足夠時間累積）
  SETTLE_MONTHS: 6,

  // 當 Steam 評分為「極度好評 (Very Positive, 代碼 8)」時，所需要的最低評論數量門檻
  MIN_REVIEWS_FOR_VERY_POSITIVE: 500,

  // 💡 語言過濾優化 (加速關鍵！)：
  // 設為 "tchinese" 代表只搜尋有支援「繁體中文」的遊戲，這會過濾掉 90% 的外國無中文獨立小品。
  // 這會讓搜尋數量從上萬筆降到一千多筆，定位與撈取速度提升 10 倍，且能完全避免 429 頻繁請求錯誤。
  // 若想尋找全語言（包含純英文）遊戲，請改為空字串 ""。
  SUPPORTED_LANG: "tchinese", 

  // 過濾開關
  EXCLUDE_FREE_TO_PLAY: false,     // 是否排除免費遊戲
  EXCLUDE_VR_ONLY: true,           // 是否排除 VR 專用遊戲
  EXCLUDE_ADULT_CONTENT: false,    // 是否排除 18+ 成人/性內容遊戲 (預設不排除，色色很健康！)
  EXCLUDE_SOFTWARE: true,          // 是否排除非遊戲實用軟體 (例如桌布軟體、開發工具)

  // 每月中文對照
  MONTH_ZH: [
    "全年度", "1月", "2月", "3月", "4月", "5月", "6月",
    "7月", "8月", "9月", "10月", "11月", "12月",
  ]
};

// 排除的競技類 tag / genre 名稱與 ID
export const EXCLUDED_COMPETITIVE_TAGS = [
  1718,   // MOBA
  17698,  // Battle Royale (大逃殺)
  1753,   // MMORPG
  128,    // Massively Multiplayer (大型多人線上)
];

// 排除的實用軟體類別名稱 (用於過濾非遊戲軟體)
export const EXCLUDED_SOFTWARE_GENRES = [
  "Utilities",
  "Design & Illustration",
  "Web Publishing",
  "Software Training",
  "Education",
  "Audio Production",
  "Video Production",
];
