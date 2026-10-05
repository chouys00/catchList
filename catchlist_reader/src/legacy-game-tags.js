// 舊初始化報告把社群標籤放在評分後；一般舊月報同一欄只放官方類型。
// 只有出現官方類型以外的內容才辨識為內嵌標籤，不以標籤數量猜測。
const officialGenres = new Set([
  "動作", "冒險", "休閒", "獨立製作", "大型多人線上", "大型多人連線",
  "競速", "角色扮演", "模擬", "運動", "策略", "免費遊玩", "搶先體驗",
  "動畫製作與模型", "音訊製作", "設計與繪圖", "教育", "照片編輯",
  "軟體培訓", "公用程式", "影片製作", "網頁出版", "未分類",
]);

export function hasLegacyCommunityTags(labels, legacyInitialization = false) {
  return legacyInitialization || labels.some((label) => label && !officialGenres.has(label));
}
