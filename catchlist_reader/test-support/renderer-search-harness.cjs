const electron = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { app, BrowserWindow } = electron;
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.disableHardwareAcceleration();
const rendererRoot = path.resolve(__dirname, "../src/renderer");

function contentType(filepath) {
  if (filepath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filepath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filepath.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function startServer() {
  const server = http.createServer((request, response) => {
    const requestedPath = new URL(request.url, "http://localhost").pathname;
    const pathname = requestedPath === "/" ? "/index.html" : requestedPath;
    const filepath = path.resolve(rendererRoot, `.${pathname}`);
    if (!filepath.startsWith(`${rendererRoot}${path.sep}`) || !fs.existsSync(filepath)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": contentType(filepath) });
    fs.createReadStream(filepath).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function searchState(window) {
  return window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[data-filter="query"]');
    return {
      value: input?.value ?? null,
      focused: document.activeElement === input,
      selectionStart: input?.selectionStart ?? null,
      selectionEnd: input?.selectionEnd ?? null,
      resultCount: document.querySelector('[data-result-count]')?.textContent ?? null,
    };
  })()`);
}

async function focusSearch(window) {
  await window.webContents.executeJavaScript(`document.querySelector('[data-filter="query"]').focus()`);
}

async function moveSearchPointer(window, inside) {
  const point = await window.webContents.executeJavaScript(`(() => {
    const rect = document.querySelector('[data-action="clear-search"]').getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
  window.webContents.sendInputEvent({ type: "mouseMove", ...(inside ? point : { x: 1, y: 1 }) });
  // 等待真正的 CSS transition 完成，不加入測試類別或停用動畫。
  await new Promise((resolve) => setTimeout(resolve, 200));
  return window.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-action="clear-search"]');
    const halo = getComputedStyle(button, '::before');
    return { hovered: button.matches(':hover'), background: getComputedStyle(button).backgroundColor,
      haloOpacity: halo.opacity, haloRadius: halo.borderRadius, haloTransform: halo.transform };
  })()`);
}

async function press(window, keyCode, modifiers = []) {
  window.focus();
  await window.webContents.executeJavaScript(`document.activeElement?.focus()`);
  const before = await window.webContents.executeJavaScript(`(() => {
    const input = document.activeElement;
    return input instanceof HTMLInputElement ? { value: input.value, selectionStart: input.selectionStart, selectionEnd: input.selectionEnd } : null;
  })()`);
  window.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (keyCode !== "Backspace" || !before) return;
  await window.webContents.executeJavaScript(`(() => {
    const input = document.activeElement;
    if (!(input instanceof HTMLInputElement) || input.value !== ${JSON.stringify(before.value)}) return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    input.setRangeText("", start === end ? Math.max(0, start - 1) : start, end, "end");
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  })()`);
}

async function measureResponsiveLayout(window) {
  const selectMedia = async (media) => {
    await window.webContents.executeJavaScript(`document.querySelector('[data-media="${media}"]')?.click()`);
    await new Promise((resolve) => setTimeout(resolve, 60));
  };
  const toolbarColumns = () => window.webContents.executeJavaScript(`(() => {
    const value = getComputedStyle(document.querySelector('.toolbar')).gridTemplateColumns;
    return value.split(/\\s+/).filter(Boolean).length;
  })()`);

  window.setContentSize(900, 700);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await selectMedia("games");
  const games = await toolbarColumns();
  const resizeBehavior = await window.webContents.executeJavaScript(`(async () => {
    const tick = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const row = document.querySelector('.item.games');
    const input = document.querySelector('[data-filter="query"]');
    const desktopTagCount = document.querySelector('.item.games .game-tag-list')?.querySelectorAll('button[data-game-tag]').length ?? null;
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    await tick();
    await tick();
    return {
      sameWidthKeepsRow: document.querySelector('.item.games') === row,
      sameWidthKeepsInput: document.querySelector('[data-filter="query"]') === input,
      desktopTagCount,
    };
  })()`);
  await selectMedia("anime");
  const anime = await toolbarColumns();
  await selectMedia("movies");
  const movies = await toolbarColumns();

  window.setContentSize(390, 844);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await selectMedia("games");
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[data-filter="query"]');
    input.value = '女神';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '女神', inputType: 'insertText' }));
  })()`);
  resizeBehavior.mobileTagCount = await window.webContents.executeJavaScript(`document.querySelector('.item.games .game-tag-list')?.querySelectorAll('button[data-game-tag]').length ?? null`);
  const tapTargets = await window.webContents.executeJavaScript(`(() => {
    const size = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null;
    };
    return {
      clearSearch: size(document.querySelector('[data-action="clear-search"]')),
      tag: size(document.querySelector('.item.games button.game-tag[data-game-tag]')),
      expand: size(document.querySelector('.item.games button.game-tag[data-expand-tags]')),
      panelClose: size(document.querySelector('[data-action="close-tag-panel"]')),
      tagOptionsToggle: size(document.querySelector('[data-action="toggle-tag-options"]')),
      copyTitle: size(document.querySelector('.item.games [data-copy-title]')),
    };
  })()`);

  return { columnsAt900: { games, anime, movies }, tapTargets, resizeBehavior };
}

async function captureResponsiveQa(window) {
  const outputDir = process.env.CATCHLIST_QA_DIR;
  if (!outputDir) return null;
  fs.mkdirSync(outputDir, { recursive: true });
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[data-filter="query"]');
    input.value = '女神';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '女神', inputType: 'insertText' }));
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 600));
  const toggleOpen = await window.webContents.executeJavaScript(`document.querySelector('[data-action="toggle-tags"]')?.getAttribute('aria-expanded') === 'true'`);
  if (!toggleOpen) await window.webContents.executeJavaScript(`document.querySelector('[data-action="toggle-tags"]')?.click()`);
  const results = {};
  for (const [name, width, height] of [["desktop", 1440, 900], ["mid", 900, 700], ["mobile", 390, 844]]) {
    window.setContentSize(width, height);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await moveSearchPointer(window, true);
    const image = await window.webContents.capturePage();
    const filepath = path.join(outputDir, `task-5-${name}.png`);
    fs.writeFileSync(filepath, image.toPNG());
    results[name] = await window.webContents.executeJavaScript(`(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      visibleRowTags: document.querySelector('.item.games .game-tag-list')?.querySelectorAll('[data-game-tag], .game-tag.fallback').length ?? 0,
      hasExpand: Boolean(document.querySelector('.item.games [data-expand-tags]')),
      panelVisible: !document.querySelector('#gameTagPanel')?.hidden,
      clearSearchVisible: !document.querySelector('[data-action="clear-search"]')?.hidden,
    }))()`);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="toggle-tags"]')?.click()`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await window.webContents.executeJavaScript(`document.querySelector('[data-action="toggle-filters"][aria-expanded="true"]')?.click()`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await window.webContents.executeJavaScript(`document.querySelector('.item.games')?.scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const mobileList = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDir, "task-5-mobile-list.png"), mobileList.toPNG());
  results.titleRows = {};
  for (const media of ["anime", "movies", "liveAction"]) {
    await window.webContents.executeJavaScript(`document.querySelector('[data-media="${media}"]')?.click()`);
    results.titleRows[media] = {};
    for (const [size, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
      window.setContentSize(width, height);
      await new Promise((resolve) => setTimeout(resolve, 180));
      await window.webContents.executeJavaScript(`document.querySelector('.item')?.scrollIntoView({ block: 'center', behavior: 'instant' })`);
      const image = await window.webContents.capturePage();
      fs.writeFileSync(path.join(outputDir, `title-${media}-${size}.png`), image.toPNG());
      results.titleRows[media][size] = await window.webContents.executeJavaScript(`(() => ({
        viewport: window.innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        titleVisible: Boolean(document.querySelector('.item .game-title-link')?.getBoundingClientRect().width),
        copyVisible: Boolean(document.querySelector('.item .copy-title-button')?.getBoundingClientRect().width),
      }))()`);
    }
  }
  return results;
}

async function waitForGameCount(window, expected) {
  await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const check = () => {
      const count = document.querySelectorAll('.item.games').length;
      if (count === ${expected}) return resolve();
      if (Date.now() > deadline) return reject(new Error('遊戲列數未變為 ${expected}，目前為 ' + count + ' ' + JSON.stringify({ scrollY, height: innerHeight, sentinel: document.querySelector('[data-game-load-sentinel]')?.getBoundingClientRect().toJSON() })));
      setTimeout(check, 25);
    };
    check();
  })`);
}

async function runLargeGameBatchTest(address) {
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false } });
  try {
    await window.loadURL(`http://127.0.0.1:${address.port}?largeGames=1`);
    await waitForGameCount(window, 50);
    const initial = await window.webContents.executeJavaScript(`(() => {
      window.__firstGameRow = document.querySelector('.item.games');
      window.__fiftiethGameRow = document.querySelectorAll('.item.games')[49];
      return {
        itemCount: document.querySelectorAll('.item.games').length,
        hasOpenAll: Boolean(document.querySelector('[data-action="open-all-games"]')),
        hasFallback: Boolean(document.querySelector('[data-action="load-more-games"]')),
      };
    })()`);

    await window.webContents.executeJavaScript(`document.querySelector('[data-game-load-sentinel]')?.scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await waitForGameCount(window, 100);
    const afterFirstAppend = await window.webContents.executeJavaScript(`(() => ({
      itemCount: document.querySelectorAll('.item.games').length,
      firstNodePreserved: document.querySelector('.item.games') === window.__firstGameRow,
      fiftiethNodePreserved: document.querySelectorAll('.item.games')[49] === window.__fiftiethGameRow,
    }))()`);

    // Let IntersectionObserver observe leaving the sentinel before the next scroll.
    await window.webContents.executeJavaScript(`window.scrollTo({ top: 0, behavior: 'instant' })`);
    await new Promise(resolve => setTimeout(resolve, 100));
    await window.webContents.executeJavaScript(`document.querySelector('[data-game-load-sentinel]')?.scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await waitForGameCount(window, 150);
    const afterSecondAppend = await window.webContents.executeJavaScript(`(() => ({
      itemCount: document.querySelectorAll('.item.games').length,
      firstNodePreserved: document.querySelector('.item.games') === window.__firstGameRow,
      fiftiethNodePreserved: document.querySelectorAll('.item.games')[49] === window.__fiftiethGameRow,
    }))()`);

    const afterFilter = await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('[data-filter="query"]');
      input.value = 'Large Game';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'Large Game', inputType: 'insertText' }));
      return { itemCount: document.querySelectorAll('.item.games').length, resultCount: document.querySelector('[data-result-count]')?.textContent ?? null };
    })()`);

    await window.webContents.executeJavaScript(`document.querySelector('[data-action="open-filtered"]')?.click()`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const oversizedOpen = await window.webContents.executeJavaScript(`({
      buttonExists: !!document.querySelector('[data-action="open-filtered"]'),
      calls: window.__catchListOpenUrlCalls.length,
      toast: document.querySelector('#toast')?.textContent?.trim() ?? null,
    })`);

    const horizontalOverflow = {};
    for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
      window.setContentSize(width, height);
      await new Promise((resolve) => setTimeout(resolve, 100));
      horizontalOverflow[name] = await window.webContents.executeJavaScript(`document.documentElement.scrollWidth > document.documentElement.clientWidth`);
    }

    return { initial, afterFirstAppend, afterSecondAppend, afterFilter, oversizedOpen, horizontalOverflow };
  } finally {
    window.destroy();
  }
}

async function runCoverUpdateTest(address) {
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false } });
  try {
    await window.loadURL(`http://127.0.0.1:${address.port}?largeGames=1&coverTest=1`);
    await waitForGameCount(window, 50);
    await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const check = () => window.__coverRequests.length === 1 ? resolve() : Date.now() > deadline ? reject(new Error('未收到首批封面請求')) : setTimeout(check, 25);
      check();
    })`);
    const initial = await window.webContents.executeJavaScript(`(() => {
      window.__firstCoverRow = document.querySelector('.item.games');
      return { requestCount: window.__coverRequests.length, firstRequestSize: window.__coverRequests[0]?.length ?? null, itemCount: document.querySelectorAll('.item.games').length };
    })()`);
    await window.webContents.executeJavaScript(`window.__releasePreviewCovers.shift()?.()`);
    await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const check = () => document.querySelector('.item.games .game-cover img') ? resolve() : Date.now() > deadline ? reject(new Error('封面未更新')) : setTimeout(check, 25);
      check();
    })`);
    const afterUpdate = await window.webContents.executeJavaScript(`({
      firstRowPreserved: document.querySelector('.item.games') === window.__firstCoverRow,
      itemCount: document.querySelectorAll('.item.games').length,
      hasLoadedCover: Boolean(document.querySelector('.item.games .game-cover img')),
    })`);
    const backdropDismiss = await window.webContents.executeJavaScript(`(async () => {
      const tick = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const dialog = document.querySelector('#coverDialog');
      document.querySelector('.item.games .game-cover')?.click();
      await tick();
      const opened = dialog?.open === true;
      document.querySelector('#coverImage')?.click();
      await tick();
      const imageKeepsOpen = dialog?.open === true;
      const bounds = dialog.getBoundingClientRect();
      dialog.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: Math.max(0, bounds.left - 5),
        clientY: Math.max(0, bounds.top - 5),
      }));
      await tick();
      return { opened, imageKeepsOpen, closedFromBackdrop: dialog?.open === false };
    })()`);
    return { initial, afterUpdate, backdropDismiss };
  } finally {
    window.destroy();
  }
}

async function run() {
  const server = await startServer();
  const address = server.address();
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false } });
  try {
    await window.loadURL(`http://127.0.0.1:${address.port}`);
    await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const done = () => document.querySelector('[data-filter="query"]') ? resolve() : Date.now() > deadline ? reject(new Error('搜尋欄位未載入：' + document.body.innerText.slice(0, 300))) : setTimeout(done, 10);
      done();
    })`);

    const initialGames = await window.webContents.executeJavaScript(`(() => ({
      railCount: document.querySelectorAll('.rail').length,
      itemCount: document.querySelectorAll('.item.games').length,
      gamesLayout: document.querySelector('.layout')?.classList.contains('games-layout') ?? false,
      openLabel: document.querySelector('[data-action="open-filtered"]')?.textContent ?? null,
      hideCount: document.querySelectorAll('[data-hide]').length,
      hasReviewFilter: Boolean(document.querySelector('[data-filter="minReviews"]')),
      scoreInput: (() => { const input = document.querySelector('[data-filter="min"]'); return { type: input.type, min: input.min, max: input.max, value: input.value }; })(),
      communityTagCount: document.querySelectorAll('[data-game-tag]').length,
      copyButtonCount: document.querySelectorAll('[data-copy-title]').length,
      brand: document.querySelector('.brand strong')?.textContent ?? null,
      fixtureGames: Array.from(document.querySelectorAll('.item.games')).map((item) => ({
        title: item.querySelector('.title strong')?.textContent ?? null,
        releaseDate: item.querySelector('.meta')?.textContent ?? null,
        score: item.querySelector('.rating strong')?.textContent ?? null,
        reviews: item.querySelector('.rating small')?.textContent ?? null,
      })),
    }))()`);

    const titleActions = await window.webContents.executeJavaScript(`(async () => {
      const tick = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const row = document.querySelector('[data-game-row="3129930"]');
      const copy = row.querySelector('[data-copy-title]');
      const copyRect = copy.getBoundingClientRect();
      copy.click();
      await tick();
      await tick();
      const afterCopy = {
        copyCalls: [...window.__catchListCopyTextCalls],
        openCalls: window.__catchListOpenUrlCalls.length,
        toast: document.querySelector('#toast')?.textContent?.trim() ?? null,
        label: copy.getAttribute('aria-label'),
        title: copy.getAttribute('title'),
        width: Math.round(copyRect.width),
        height: Math.round(copyRect.height),
      };
      row.querySelector('.game-title-link').click();
      await tick();
      await tick();
      return { afterCopy, afterOpen: { copyCalls: window.__catchListCopyTextCalls.length, openCalls: window.__catchListOpenUrlCalls } };
    })()`);
    await window.webContents.executeJavaScript(`document.querySelector('[data-game-row="3129930"] .game-title-link').focus()`);
    await press(window, "Tab");
    titleActions.focus = await window.webContents.executeJavaScript(`(() => {
      const copy = document.querySelector('[data-game-row="3129930"] [data-copy-title]');
      const style = getComputedStyle(copy);
      return { active: document.activeElement === copy, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    })()`);
    window.webContents.debugger.attach("1.3");
    await window.webContents.debugger.sendCommand("DOM.enable");
    await window.webContents.debugger.sendCommand("CSS.enable");
    const documentNode = await window.webContents.debugger.sendCommand("DOM.getDocument");
    const copyNode = await window.webContents.debugger.sendCommand("DOM.querySelector", {
      nodeId: documentNode.root.nodeId,
      selector: '[data-game-row="3129930"] [data-copy-title]',
    });
    await window.webContents.debugger.sendCommand("CSS.forcePseudoState", { nodeId: copyNode.nodeId, forcedPseudoClasses: ["hover"] });
    titleActions.hover = await window.webContents.executeJavaScript(`(() => {
      const copy = document.querySelector('[data-game-row="3129930"] [data-copy-title]');
      const style = getComputedStyle(copy);
      return { hovered: copy.matches(':hover'), color: style.color, borderColor: style.borderColor, backgroundColor: style.backgroundColor };
    })()`);
    await window.webContents.debugger.sendCommand("CSS.forcePseudoState", { nodeId: copyNode.nodeId, forcedPseudoClasses: [] });
    window.webContents.debugger.detach();

    await focusSearch(window);
    await window.webContents.insertText("abcdef");
    const typed = await searchState(window);

    await press(window, "Backspace");
    await press(window, "Backspace");
    const backspaced = await searchState(window);

    await window.webContents.executeJavaScript(`document.querySelector('[data-filter="query"]').setSelectionRange(2, 2)`);
    await window.webContents.insertText("X");
    const insertedInMiddle = await searchState(window);

    await window.webContents.executeJavaScript(`document.querySelector('[data-filter="query"]').setSelectionRange(1, 4)`);
    await window.webContents.insertText("Z");
    const replacedSelection = await searchState(window);

    await press(window, "A", ["control"]);
    // Windows 背景視窗可能未接收原生 Ctrl+A；明確設定本案例需要的全選範圍。
    await window.webContents.executeJavaScript(`document.querySelector('[data-filter="query"]').select()`);
    await window.webContents.insertText("你有餅嗎？");
    const chinese = await searchState(window);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const clearHover = await moveSearchPointer(window, true);
    const clearLeave = await moveSearchPointer(window, false);
    const clearButton = await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('[data-filter="query"]');
      const button = document.querySelector('[data-action="clear-search"]');
      const beforeRect = button.getBoundingClientRect();
      const before = { hidden: button.hidden, label: button.getAttribute('aria-label'), title: button.getAttribute('title'), width: Math.round(beforeRect.width), height: Math.round(beforeRect.height) };
      button.click();
      const after = { value: input.value, focused: document.activeElement === input, hidden: button.hidden, resultCount: document.querySelector('[data-result-count]').textContent };
      input.value = '你有餅嗎？';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '你有餅嗎？', inputType: 'insertText' }));
      return { before, after };
    })()`);

    const gameBrowser = await window.webContents.executeJavaScript(`(async () => {
      const tick = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const nameInput = document.querySelector('[data-filter="query"]');
      document.querySelector('[data-action="toggle-filters"]').click();
      const toggle = document.querySelector('[data-action="toggle-tags"]');
      toggle?.click();
      await tick();
      const opened = toggle?.getAttribute('aria-expanded') === 'true';
      const strategy = document.querySelector('[data-game-tag="策略"]');
      strategy?.click();
      await tick();
      const afterSelect = {
        nameInputStable: document.querySelector('[data-filter="query"]') === nameInput,
        selectedCount: document.querySelectorAll('[data-selected-tag]').length,
        toggleText: document.querySelector('[data-action="toggle-tags"]')?.textContent ?? null,
        itemCount: document.querySelectorAll('.item.games').length,
      };
      const tagInput = document.querySelector('[data-filter="tagQuery"]');
      if (tagInput) {
        tagInput.focus();
        tagInput.value = '牌';
        tagInput.dispatchEvent(new InputEvent('input', { bubbles: true, data: '牌', inputType: 'insertText' }));
      }
      await tick();
      const afterTagSearch = {
        nameInputStable: document.querySelector('[data-filter="query"]') === nameInput,
        tagInputStable: document.querySelector('[data-filter="tagQuery"]') === tagInput,
        tagValue: tagInput?.value ?? null,
        hasDeckTag: Boolean(document.querySelector('[data-game-tag="牌組製作"]')),
        selectedTagVisible: Boolean(document.querySelector('[data-selected-tags] [data-game-tag="策略"]')),
        optionsScrollable: document.querySelector('[data-available-tags]')?.classList.contains('scrollable') ?? false,
        maxHeight: getComputedStyle(document.querySelector('[data-available-tags]')).maxHeight,
        overflowY: getComputedStyle(document.querySelector('[data-available-tags]')).overflowY,
        clientHeight: document.querySelector('[data-available-tags]')?.clientHeight ?? null,
      };
      if (tagInput) {
        tagInput.value = '';
        tagInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      }
      await tick();
      const availableTags = document.querySelector('[data-available-tags]');
      const moreButton = document.querySelector('[data-action="toggle-tag-options"]');
      const tagOptionsInitial = {
        expanded: moreButton?.getAttribute('aria-expanded') ?? null,
        label: moreButton?.textContent?.trim() ?? null,
        availableClass: availableTags?.className ?? null,
        summary: document.querySelector('[data-tag-summary]')?.textContent?.trim() ?? null,
        clientHeight: availableTags?.clientHeight ?? null,
        overflowY: availableTags ? getComputedStyle(availableTags).overflowY : null,
        hidden: moreButton?.hidden ?? null,
        physicallyOverflowing: availableTags ? availableTags.scrollHeight > availableTags.clientHeight : null,
      };
      const stableBeforeMore = document.querySelector('[data-filter="tagQuery"]');
      document.querySelector('[data-action="toggle-tag-options"]')?.click();
      await tick();
      const tagOptionsExpanded = {
        tagInputStable: document.querySelector('[data-filter="tagQuery"]') === stableBeforeMore,
        expanded: document.querySelector('[data-action="toggle-tag-options"]')?.getAttribute('aria-expanded') ?? null,
        label: document.querySelector('[data-action="toggle-tag-options"]')?.textContent?.trim() ?? null,
        scrollable: document.querySelector('[data-available-tags]')?.classList.contains('scrollable') ?? false,
        maxHeight: getComputedStyle(document.querySelector('[data-available-tags]')).maxHeight,
        overflowY: getComputedStyle(document.querySelector('[data-available-tags]')).overflowY,
        physicallyScrollable: document.querySelector('[data-available-tags]').scrollHeight > document.querySelector('[data-available-tags]').clientHeight,
      };
      document.querySelector('[data-action="toggle-tag-options"]')?.click();
      await tick();
      const tagOptionsCollapsed = {
        expanded: document.querySelector('[data-action="toggle-tag-options"]')?.getAttribute('aria-expanded') ?? null,
        label: document.querySelector('[data-action="toggle-tag-options"]')?.textContent?.trim() ?? null,
      };
      availableTags.style.width = '20000px';
      window.dispatchEvent(new Event('resize'));
      await tick();
      await tick();
      const noOverflow = {
        physicallyOverflowing: availableTags.scrollHeight > availableTags.clientHeight,
        moreHidden: document.querySelector('[data-action="toggle-tag-options"]')?.hidden ?? null,
      };
      availableTags.style.width = '';
      window.dispatchEvent(new Event('resize'));
      await tick();
      await tick();
      document.querySelector('[data-action="close-tag-panel"]')?.click();
      await tick();
      const collapsed = document.querySelector('[data-action="toggle-tags"]')?.getAttribute('aria-expanded') === 'false';
      const panelHidden = document.querySelector('#gameTagPanel')?.hidden === true;
      document.querySelector('[data-action="toggle-tags"]')?.click();
      await tick();
      const reopened = document.querySelector('#gameTagPanel')?.hidden === false;
      const rowToggle = document.querySelector('.item.games [data-expand-tags]');
      const initialRowToggle = { label: rowToggle?.textContent?.trim() ?? null, expanded: rowToggle?.getAttribute('aria-expanded') ?? null };
      rowToggle?.click();
      await tick();
      const collapseRowToggle = document.querySelector('.item.games [data-expand-tags]');
      const expandedRowToggle = { label: collapseRowToggle?.textContent?.trim() ?? null, expanded: collapseRowToggle?.getAttribute('aria-expanded') ?? null };
      collapseRowToggle?.click();
      await tick();
      const restoredRowToggle = document.querySelector('.item.games [data-expand-tags]');
      const collapsedRowToggle = { label: restoredRowToggle?.textContent?.trim() ?? null, expanded: restoredRowToggle?.getAttribute('aria-expanded') ?? null };
      return {
        opened,
        afterSelect,
        afterTagSearch,
        tagOptionsInitial,
        tagOptionsExpanded,
        tagOptionsCollapsed,
        noOverflow,
        collapsed,
        panelHidden,
        reopened,
        initialRowToggle,
        expandedRowToggle,
        collapsedRowToggle,
      };
    })()`);

    await window.webContents.executeJavaScript(`document.querySelector('[data-media="anime"]').click()`);
    const animeBeforeSearch = await searchState(window);
    await focusSearch(window);
    await window.webContents.insertText("星海");
    const animeAfterSearch = await searchState(window);
    const animeRailCount = await window.webContents.executeJavaScript(`document.querySelectorAll('.rail').length`);
    const animeTitleActions = await window.webContents.executeJavaScript(`(async () => {
      const row = document.querySelector('.item.anime');
      const title = row.querySelector('.title-primary')?.textContent;
      row.querySelector('[data-copy-title]').click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const copied = window.__catchListCopyTextCalls.at(-1);
      row.querySelector('.game-title-link').click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return { title, copied, opened: window.__catchListOpenUrlCalls.at(-1)?.[0], toast: document.querySelector('#toast')?.textContent?.trim() };
    })()`);
    await window.webContents.executeJavaScript(`document.querySelector('[data-media="movies"]').click()`);
    const movieRailCount = await window.webContents.executeJavaScript(`document.querySelectorAll('.rail').length`);
    const movieTitleActions = await window.webContents.executeJavaScript(`(async () => {
      const row = document.querySelector('.item.movies');
      const title = row.querySelector('.title-primary')?.textContent;
      row.querySelector('[data-copy-title]').click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const copied = window.__catchListCopyTextCalls.at(-1);
      row.querySelector('.game-title-link').click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return { title, copied, opened: window.__catchListOpenUrlCalls.at(-1)?.[0] };
    })()`);
    await window.webContents.executeJavaScript(`document.querySelector('[data-media="liveAction"]').click()`);
    const liveActionTitleActions = await window.webContents.executeJavaScript(`(async () => {
      const row = document.querySelector('.item.live-action');
      const title = row.querySelector('.title-primary')?.textContent;
      row.querySelector('[data-copy-title]').click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const copied = window.__catchListCopyTextCalls.at(-1);
      row.querySelector('.game-title-link').click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return { title, copied, opened: window.__catchListOpenUrlCalls.at(-1)?.[0], imdbButton: row.querySelector('.actions [data-open]')?.textContent };
    })()`);
    const liveAction = await window.webContents.executeJavaScript(`(() => {
      const initial = {
        itemCount: document.querySelectorAll('.item.live-action').length,
        hideCount: document.querySelectorAll('[data-hide]').length,
        regionOptions: Array.from(document.querySelector('[data-filter="region"]')?.options ?? []).map((option) => option.value),
      };
      const region = document.querySelector('[data-filter="region"]');
      region.value = '韓劇';
      region.dispatchEvent(new Event('change', { bubbles: true }));
      const koreanCount = document.querySelectorAll('.item.live-action').length;
      const query = document.querySelector('[data-filter="query"]');
      query.value = '我的出走日記';
      query.dispatchEvent(new InputEvent('input', { bubbles: true, data: '我的出走日記', inputType: 'insertText' }));
      return { ...initial, koreanCount, searchCount: document.querySelectorAll('.item.live-action').length };
    })()`);
    await window.webContents.executeJavaScript(`document.querySelector('[data-media="games"]').click()`);
    const restoredGameSearch = await searchState(window);

    const clearInteraction = await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('[data-filter="query"]');
      document.querySelector('[data-action="clear-filters"]').click();
      return {
        nameInputStable: document.querySelector('[data-filter="query"]') === input,
        selectedCount: document.querySelectorAll('[data-selected-tag]').length,
        itemCount: document.querySelectorAll('.item.games').length,
      };
    })()`);
    const cleared = await searchState(window);
    const responsiveLayout = await measureResponsiveLayout(window);
    const visualQa = await captureResponsiveQa(window);
    const largeGameBatch = await runLargeGameBatchTest(address);
    const coverUpdate = await runCoverUpdateTest(address);

    process.stdout.write(`${JSON.stringify({ initialGames, titleActions, typed, backspaced, insertedInMiddle, replacedSelection, chinese, clearHover, clearLeave, clearButton, gameBrowser, animeBeforeSearch, animeAfterSearch, animeRailCount, animeTitleActions, movieRailCount, movieTitleActions, liveActionTitleActions, liveAction, restoredGameSearch, clearInteraction, cleared, responsiveLayout, visualQa, largeGameBatch, coverUpdate })}\n`);
  } finally {
    window.destroy();
    await new Promise((resolve) => server.close(resolve));
    app.quit();
  }
}

app.whenReady().then(run).catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  app.exit(1);
});
