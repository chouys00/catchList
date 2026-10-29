import test from "node:test";
import assert from "node:assert/strict";
import { SteamConfirmation, allowedSteamNavigation, isTargetSteamApp } from "../src/steam-confirmation.js";
import { lookupSteamTags, lookupSteamGame, SteamVerificationRequired } from "../src/steam-game-lookup.js";

test("僅同款官方年齡轉址與確認頁需要互動；其他錯誤不冒充年齡確認", async () => {
  const response = location => ({ ok: false, status: 302, headers: new Headers({ location }) });
  for (const location of ["/agecheck/app/123/", "https://store.steampowered.com/agecheck/app/123/?cc=tw"]) {
    await assert.rejects(lookupSteamTags("123", { fetcher: async () => response(location) }), error => error.code === "STEAM_VERIFICATION_REQUIRED" && error.appid === "123");
  }
  for (const location of ["/", "/agecheck/app/456/", "https://evil.test/agecheck/app/123/"]) {
    await assert.rejects(lookupSteamTags("123", { fetcher: async () => response(location) }), error => !error.code && /轉址/.test(error.message));
  }
  for (const html of ['<form id="agecheck_form"></form>', '<div class="agegate_box"></div>', '<select id="agegate_birthday_selector"></select>']) {
    await assert.rejects(lookupSteamTags("123", { fetcher: async () => ({ ok: true, text: async () => html }) }), SteamVerificationRequired);
  }
  assert.deepEqual(await lookupSteamTags("123", { fetcher: async (_url, options) => {
    assert.equal(options.headers.Cookie, undefined);
    return { ok: true, text: async () => '<script>const agecheck_form = true;</script><a class="app_tag">探索</a>' };
  } }), ["探索"]);
  await assert.rejects(lookupSteamTags("123", { fetcher: async () => ({ ok: false, status: 429 }) }), /限制請求/);
});

test("手動預覽保留主資料與缺漏警告，另標示需要確認，不偽造標籤", async () => {
  const result = await lookupSteamGame("123", { fetcher: async url => {
    if (url.includes("appdetails")) return { ok: true, json: async () => ({ 123: { success: true, data: { type: "game", name: "測試" } } }) };
    if (url.includes("GetAppReviews")) return { ok: true, json: async () => ({ response: { query_summary: { total_reviews: 2, total_positive: 1 } } }) };
    return { ok: false, status: 302, headers: new Headers({ location: "/agecheck/app/123" }) };
  } });
  assert.equal(result.verificationRequired, true);
  assert.equal(result.score, 50);
  assert.deepEqual(result.tags, []);
  assert.match(result.warnings[0], /官方確認/);
});

test("官方導覽只接受指定 HTTPS 網域，不接受相似網域或其他協定", () => {
  for (const url of ["https://store.steampowered.com/app/123", "https://login.steampowered.com/", "https://steamcommunity.com/login/"]) assert.equal(allowedSteamNavigation(url), true);
  for (const url of ["https://store.steampowered.com.evil.test/", "http://store.steampowered.com/", "https://evil@store.steampowered.com/", "https://store.steampowered.com:8080/", "file:///test", "steam://run/123", "javascript:alert(1)"]) assert.equal(allowedSteamNavigation(url), false);
});

test("確認後接受同款含名稱的商店網址，不把其他遊戲或確認頁判為完成", () => {
  for (const url of ["https://store.steampowered.com/app/123", "https://store.steampowered.com/app/123/", "https://store.steampowered.com/app/123/Test_Game/?l=tchinese"]) assert.equal(isTargetSteamApp(url, "123"), true);
  for (const url of ["https://store.steampowered.com/app/1234/", "https://store.steampowered.com/agecheck/app/123/", "https://evil.test/app/123/", "https://steamcommunity.com/app/123/"]) assert.equal(isTargetSteamApp(url, "123"), false);
});

test("確認一次重跑一次，重複點擊共用同一請求，使用後不能重播", async () => {
  let finish; let runs = 0; let opened = 0; let focused = 0;
  const open = () => { opened++; return new Promise(resolve => { finish = resolve; }); };
  open.focus = () => focused++;
  const service = new SteamConfirmation({ open });
  const info = service.issue({ appid: "123", title: "測試", kind: "refresh", valid: () => true, retry: async () => { runs++; return { saved: true }; } });
  const first = service.start(info.requestId);
  assert.equal(service.start(info.requestId), first);
  assert.equal(focused, 1);
  assert.throws(() => service.issue({}), /先完成/);
  finish(true);
  assert.deepEqual(await first, { status: "completed", result: { saved: true } });
  assert.equal(runs, 1); assert.equal(opened, 1);
  assert.throws(() => service.start(info.requestId), /失效/);
});

test("取消、過期資料夾及錯誤請求不得重跑或保存，取消不影響其他類型", async () => {
  let finish; let runs = 0; let current = true;
  const service = new SteamConfirmation({ open: () => new Promise(resolve => { finish = resolve; }) });
  const create = () => service.issue({ appid: "123", title: "測試", kind: "refresh", valid: () => current, retry: async () => { runs++; } });
  const info = create();
  assert.throws(() => service.start("wrong"), /失效/);
  const running = service.start(info.requestId);
  service.cancel("preview"); assert.ok(service.request);
  service.cancel(null, "wrong"); assert.ok(service.request);
  service.cancel(); finish(true);
  assert.deepEqual(await running, { status: "cancelled" }); assert.equal(runs, 0);
  const next = create(); current = false;
  assert.throws(() => service.start(next.requestId), /失效/);
});

test("重跑仍要求確認時停止，執行中取消後不回傳過期結果", async () => {
  const service = new SteamConfirmation({ open: async () => true });
  const info = service.issue({ appid: "123", kind: "refresh", valid: () => true, retry: async () => { throw new SteamVerificationRequired("123"); } });
  await assert.rejects(service.start(info.requestId), /仍要求確認/);
  assert.equal(service.request, null);
  let complete;
  const next = service.issue({ appid: "123", kind: "refresh", valid: () => true, retry: () => new Promise(resolve => { complete = resolve; }) });
  const pending = service.start(next.requestId);
  await Promise.resolve(); service.cancel(); complete({ saved: false });
  assert.deepEqual(await pending, { status: "cancelled" });
});
