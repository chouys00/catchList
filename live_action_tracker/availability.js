function taiwanSubscriptionProviders(providerData) {
  const providers = providerData?.results?.TW?.flatrate;
  if (!Array.isArray(providers)) return [];
  return [...new Set(providers
    .map((provider) => typeof provider?.provider_name === "string" ? provider.provider_name.trim() : "")
    .filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * 五區劇集都必須列在臺灣訂閱制串流（TMDb／JustWatch）才保留。
 * 呼叫端的供應商查詢若失敗會直接拋出，不能誤當成沒有上架。
 */
export async function filterByTaiwanSubscription(selections, { getWatchProviders }) {
  if (typeof getWatchProviders !== "function") throw new Error("缺少臺灣串流供應商查詢函式。");
  const kept = [];
  const excluded = [];
  for (const selection of selections ?? []) {
    const providerData = await getWatchProviders(selection.tmdbId);
    const providers = taiwanSubscriptionProviders(providerData);
    if (providers.length === 0) {
      excluded.push({ ...selection, taiwanSubscriptionProviders: [] });
      continue;
    }
    kept.push({ ...selection, taiwanSubscriptionProviders: providers });
  }
  return { selections: kept, excluded };
}

export { taiwanSubscriptionProviders };
