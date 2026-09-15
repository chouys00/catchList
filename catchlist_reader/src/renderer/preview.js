if (location.protocol.startsWith("http") && !window.catchList) {
  const games = [
    {
      id: "game-4225940", media: "games", sectionKey: "2026-02", periodLabel: "2026 年 2 月", year: 2026, month: 2,
      appid: "4225940", title: "不好啦!師父被女妖精抓走了!", originalTitle: "SIFU Kidnapped! Adventure in the Women's Kingdom", releaseDate: "2026-02-04", score: 96, reviews: 2721, chineseSupport: "supported",
      genres: ["冒險", "休閒", "獨立製作", "角色扮演", "策略"],
      tags: ["全動態影像", "沉浸模擬", "色情內容", "角色扮演", "電影感", "互動小說", "戀愛模擬", "視覺小說", "第一人稱視角", "感性", "策略", "獨立", "氛圍", "神話", "劇情豐富", "多結局", "單人", "休閒", "冒險"],
      url: "https://store.steampowered.com/app/4225940",
    },
    {
      id: "game-3300800", media: "games", sectionKey: "2026-02", periodLabel: "2026 年 2 月", year: 2026, month: 2,
      appid: "3300800", title: "HER TREES : PUZZLE DREAM", originalTitle: "HER TREES : PUZZLE DREAM", releaseDate: "2026-02-10", score: 97, reviews: 1768, chineseSupport: "unsupported",
      genres: ["冒險", "獨立製作"],
      tags: ["解謎", "點擊冒險", "放鬆", "2D", "超現實", "線性", "風格化", "手繪", "抽象", "貓", "自然", "心理", "氛圍", "冒險", "靈異", "單人", "獨立", "試驗性", "愜意", "密室逃脫"],
      url: "https://store.steampowered.com/app/3300800",
    },
    {
      id: "game-3205380", media: "games", sectionKey: "2026-02", periodLabel: "2026 年 2 月", year: 2026, month: 2,
      appid: "3205380", title: "你有餅嗎？", originalTitle: "Omelet You Cook", releaseDate: "2026-02-08", score: 97, reviews: 1500, chineseSupport: "unknown",
      genres: ["動作", "休閒", "獨立製作", "策略"],
      tags: ["類 Rogue 牌組製作", "烹飪", "物理", "值得重玩", "輕度 Rogue", "愜意", "動物", "動作類 Rogue", "放鬆", "即時", "回合制", "競分", "街機", "類 Rogue", "策略", "牌組製作", "像素風格", "動作", "闔家", "休閒"],
      url: "https://store.steampowered.com/app/3205380",
    },
    {
      id: "game-4270390", media: "games", sectionKey: "2026-02", periodLabel: "2026 年 2 月", year: 2026, month: 2,
      appid: "4270390", title: "D1AL-ogue", originalTitle: "D1AL-ogue", releaseDate: "2026-02-04", score: 95, reviews: 1347, chineseSupport: "supported",
      genres: ["休閒", "獨立製作", "免費遊玩"],
      tags: ["電馭叛客", "解謎", "反烏托邦", "視覺小說", "三消", "劇情豐富", "放鬆", "像素風格", "獨立", "多結局", "休閒", "對話導向", "科幻", "日本動畫", "2D", "線性", "單人", "免費遊玩", "色情內容"],
      url: "https://store.steampowered.com/app/4270390",
    },
    {
      id: "game-4261980", media: "games", sectionKey: "2026-02", periodLabel: "2026 年 2 月", year: 2026, month: 2,
      appid: "4261980", title: "女神的贴身男仆", originalTitle: "女神的贴身男仆", releaseDate: "2026-02-06", score: 99, reviews: 666, chineseSupport: "supported",
      genres: ["休閒", "獨立製作", "角色扮演", "模擬"],
      tags: ["角色扮演", "沉浸模擬", "互動小說", "視覺小說", "休閒", "戀愛模擬", "全動態影像", "生活模擬", "模擬", "第一人稱視角", "劇情豐富", "多結局", "選擇導向", "獨立", "擬真", "單人", "色情內容"],
      url: "https://store.steampowered.com/app/4261980",
    },
    {
      id: "game-4314560", media: "games", sectionKey: "2026-02", periodLabel: "2026 年 2 月", year: 2026, month: 2,
      appid: "4314560", title: "Cartapli : Fold Quest", originalTitle: "Cartapli : Fold Quest", releaseDate: "2026-02-04", score: 98, reviews: 660, chineseSupport: "supported",
      genres: ["休閒", "獨立製作", "角色扮演", "策略", "免費遊玩"],
      tags: ["回合制戰術", "輕度 Rogue", "角色扮演", "玩家合作", "策略", "策略角色扮演", "回合制策略", "桌上遊戲", "類 Rogue", "休閒", "2D", "可愛", "等角視角", "俯視視角", "回合制戰鬥", "動作", "手繪", "闔家", "奇幻", "免費遊玩"],
      url: "https://store.steampowered.com/app/4314560",
    },
    {
      id: "game-3129930", media: "games", sectionKey: "2026-02", periodLabel: "2026 年 2 月", year: 2026, month: 2,
      appid: "3129930", title: "銀河灰暗角落", originalTitle: "Nonentity Galaxy", releaseDate: "2026-02-03", score: 95, reviews: 562, chineseSupport: "supported",
      genres: ["獨立製作", "策略"],
      tags: ["策略", "戰術", "輕度 Rogue", "資源管理", "黑色幽默", "太空", "類 Rogue", "太空模擬", "科幻", "管理", "劇情豐富", "像素風格", "復古", "電馭叛客", "獨立", "自動對戰", "資本主義", "模擬", "對話導向", "單人"],
      url: "https://store.steampowered.com/app/3129930",
    },
  ];
  const anime = Array.from({ length: 9 }, (_, index) => ({ id: `anime-${index}`, media: "anime", sectionKey: index > 5 ? "2025-冬" : "2026-春", periodLabel: index > 5 ? "2025 年冬季" : "2026 年春季", year: index > 5 ? 2025 : 2026, season: index > 5 ? "冬" : "春", title: ["星海郵差", "春日食堂", "無聲樂團", "迷宮圖書館", "北境列車", "紙飛機日記", "月下劍客", "雨城偵探", "最後的魔法課"][index], score: 9.1 - index * .13, episodes: "12", format: "TV", searchUrl: `https://www.google.com/search?q=${index}` }));
  const movies = Array.from({ length: 9 }, (_, index) => ({ id: `movie-${index}`, media: "movies", sectionKey: index > 5 ? "2024-12" : "2025-09", periodLabel: index > 5 ? "2024 年 12 月" : "2025 年 9 月", year: index > 5 ? 2024 : 2025, month: index > 5 ? 12 : 9, title: ["遠方來信", "第七月台", "慢速風暴", "海岸線以南", "昨日旅館", "長夜將明", "玻璃花園", "夏末回聲", "沒有名字的街"][index], category: index % 2 ? "文藝劇情" : "一般外國片", score: 8.8 - index * .15, imdbScore: 8.6 - index * .1, votesLabel: `${43 + index * 17}k票`, searchUrl: `https://www.google.com/search?q=${index}` }));
  const previewParams = new URLSearchParams(location.search);
  const largeGames = previewParams.has("largeGames")
    ? Array.from({ length: 1000 }, (_, index) => ({
      id: `large-game-${index}`, media: "games", sectionKey: "2026-02", periodLabel: "2026 年 2 月", year: 2026, month: 2,
      appid: String(5000000 + index), title: `Large Game ${String(index + 1).padStart(4, "0")}`, originalTitle: "Large Game", releaseDate: `2026-02-${String((index % 28) + 1).padStart(2, "0")}`,
      score: 95, reviews: 1000 + index, chineseSupport: index % 11 === 0 ? "unknown" : index % 7 === 0 ? "unsupported" : "supported", genres: ["策略"], tags: ["策略"], url: `https://store.steampowered.com/app/${5000000 + index}`,
    }))
    : games;
  const payload = { dataDir: "G:\\我的雲端硬碟\\CatchList", canUndo: false, libraries: [
    { media: "games", filename: "遊戲.md", exists: true, entries: largeGames, sections: [{ key: "2026-02", label: "2026 年 2 月" }] },
    { media: "anime", filename: "動畫.md", exists: true, entries: anime, sections: [] },
    { media: "movies", filename: "電影.md", exists: true, entries: movies, sections: [] },
  ] };
  window.__catchListOpenUrlCalls = [];
  window.__coverRequests = [];
  window.__releasePreviewCovers = [];
  const resolveGameCovers = previewParams.has("coverTest")
    ? (appids) => new Promise((resolve) => {
      window.__coverRequests.push(appids);
      window.__releasePreviewCovers.push(() => resolve(Object.fromEntries(appids.map((appid) => [appid, `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header_tchinese.jpg`]))));
    })
    : undefined;
  window.catchList = { load: async () => payload, chooseDirectory: async () => payload, openUrls: async (urls) => { window.__catchListOpenUrlCalls.push(urls); return true; }, hideEntry: async () => payload, deleteEntry: async () => payload, undoLastOperation: async () => ({ ...payload, restored: { title: "示範作品" } }), resolveGameCovers };
}
