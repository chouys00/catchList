// 頁面捲動與元件內的鍵盤操作分開；End 的分批定位可隨時取消。
export function installListKeyboard({ getContext, appendBatch, win = window, doc = document }) {
  let task = null;
  const cancel = () => {
    if (task) win.cancelAnimationFrame(task.frame);
    task = null;
  };
  const editing = target => target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="listbox"]');
  const scrollContainer = target => {
    for (let node = target; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(win.getComputedStyle(node).overflowY)) return node;
    }
    return null;
  };
  const blocked = target => {
    if (doc.querySelector('dialog[open], [role="menu"]')) return true;
    return Boolean(editing(target) || scrollContainer(target));
  };
  const keydown = event => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
    if (blocked(event.target)) {
      cancel();
      // 原生 dialog 不會自動阻止按鈕上的 End 捲動背景頁面。
      if (doc.querySelector('dialog[open], [role="menu"]') && !editing(event.target)) {
        event.preventDefault();
        const container = scrollContainer(event.target);
        if (container) {
          if (event.key === "Home" || event.key === "End") container.scrollTo({ top: event.key === "Home" ? 0 : container.scrollHeight, behavior: "instant" });
          else container.scrollBy({ top: event.key === "ArrowDown" ? 80 : -80, behavior: "instant" });
        }
      }
      return;
    }
    const context = getContext();
    if (!context?.list) return;
    event.preventDefault();
    if (event.key !== "End") {
      cancel();
      if (event.key === "Home") win.scrollTo({ top: 0, behavior: "instant" });
      else win.scrollBy({ top: event.key === "ArrowDown" ? 80 : -80, behavior: "instant" });
      return;
    }
    if (task) return;
    const current = task = { frame: null, context };
    const advance = () => {
      if (task !== current) return;
      const latest = getContext();
      if (blocked(doc.activeElement) || latest?.list !== context.list || latest?.entries !== context.entries) { cancel(); return; }
      if (appendBatch(context)) {
        current.frame = win.requestAnimationFrame(advance);
      } else {
        task = null;
        win.scrollTo({ top: doc.documentElement.scrollHeight, behavior: "instant" });
      }
    };
    current.frame = win.requestAnimationFrame(advance);
  };
  // window 冒泡階段能看到選單等元件已處理的事件。
  win.addEventListener("keydown", keydown);
  for (const type of ["wheel", "touchstart", "pointerdown", "input", "change", "click"]) doc.addEventListener(type, cancel, { capture: true, passive: true });
  win.addEventListener("blur", cancel);
  return { cancel };
}
