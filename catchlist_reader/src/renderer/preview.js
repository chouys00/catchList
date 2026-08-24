if (location.protocol.startsWith("http") && !window.catchList) {
  const games = Array.from({ length: 8 }, (_, index) => ({
    id: `game-${index}`, media: "games", sectionKey: index > 4 ? "2025-12" : "2026-01", periodLabel: index > 4 ? "2025 年 12 月" : "2026 年 1 月",
    title: ["極光旅人", "深夜拉麵店", "微型王國", "紙上銀河", "失落訊號", "山海拾光", "一人太空站", "黑潮檔案"][index], originalTitle: "Sample Game", releaseDate: "2026-01-12",
    score: 95 + index % 4, reviews: 1280 + index * 731, genres: index % 2 ? ["冒險", "獨立製作"] : ["策略", "休閒"], url: `https://store.steampowered.com/app/${1000 + index}`,
  }));
  const anime = Array.from({ length: 9 }, (_, index) => ({ id: `anime-${index}`, media: "anime", sectionKey: index > 5 ? "2025-冬" : "2026-春", periodLabel: index > 5 ? "2025 年冬季" : "2026 年春季", year: index > 5 ? 2025 : 2026, season: index > 5 ? "冬" : "春", title: ["星海郵差", "春日食堂", "無聲樂團", "迷宮圖書館", "北境列車", "紙飛機日記", "月下劍客", "雨城偵探", "最後的魔法課"][index], score: 9.1 - index * .13, episodes: "12", format: "TV", searchUrl: `https://www.google.com/search?q=${index}` }));
  const movies = Array.from({ length: 9 }, (_, index) => ({ id: `movie-${index}`, media: "movies", sectionKey: index > 5 ? "2024-12" : "2025-09", periodLabel: index > 5 ? "2024 年 12 月" : "2025 年 9 月", year: index > 5 ? 2024 : 2025, month: index > 5 ? 12 : 9, title: ["遠方來信", "第七月台", "慢速風暴", "海岸線以南", "昨日旅館", "長夜將明", "玻璃花園", "夏末回聲", "沒有名字的街"][index], category: index % 2 ? "文藝劇情" : "一般外國片", score: 8.8 - index * .15, imdbScore: 8.6 - index * .1, votesLabel: `${43 + index * 17}k票`, searchUrl: `https://www.google.com/search?q=${index}` }));
  const payload = { dataDir: "G:\\我的雲端硬碟\\CatchList", canUndo: false, libraries: [
    { media: "games", filename: "遊戲.md", exists: true, entries: games, sections: [{ key: "2026-01", label: "2026 年 1 月" }, { key: "2025-12", label: "2025 年 12 月" }] },
    { media: "anime", filename: "動畫.md", exists: true, entries: anime, sections: [] },
    { media: "movies", filename: "電影.md", exists: true, entries: movies, sections: [] },
  ] };
  window.catchList = { load: async () => payload, chooseDirectory: async () => payload, openUrls: async () => true, deleteEntry: async () => payload, undoDelete: async () => ({ ...payload, restored: { title: "示範作品" } }) };
}
