const PRESETS = [85, 90, 95, 97];

export function ratingInputMarkup(key, value) {
  const label = key === "max" ? "上限" : "下限";
  const escaped = String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  return `<div class="rating-input" data-rating-control><input class="field" type="number" min="0" max="100" step="any" inputmode="decimal" data-filter="${key}" value="${escaped}" placeholder="無${label}" aria-label="好評率${label}" aria-describedby="ratingRangeError" role="combobox" aria-expanded="false" aria-controls="rating-options-${key}" aria-haspopup="listbox" aria-autocomplete="none"><span class="rating-percent" aria-hidden="true">%</span><button class="rating-dropdown" type="button" aria-label="選擇好評率${label}" aria-haspopup="listbox" aria-expanded="false" aria-controls="rating-options-${key}" title="快速選擇好評率"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4"/></svg></button><div class="rating-options" id="rating-options-${key}" role="listbox" aria-label="好評率${label}預設選項" hidden>${PRESETS.map(number => `<div class="rating-option" id="rating-option-${key}-${number}" role="option" aria-selected="false" data-rating-value="${number}">${number}<span>%</span></div>`).join("")}</div></div>`;
}

/** 以事件代理支援清單重新繪製；篩選值仍由 app 的 input 事件統一更新。 */
export class RatingInputs {
  constructor(root) {
    this.root = root;
    this.openControl = null;
    this.wheelInput = null;
    this.wheelDelta = 0;
    root.addEventListener("click", event => {
      const toggle = event.target.closest(".rating-dropdown");
      if (toggle) {
        const control = toggle.closest("[data-rating-control]");
        if (this.openControl === control) { this.close(); control.querySelector("input").focus(); }
        else this.open(control);
      }
      const option = event.target.closest("[data-rating-value]");
      if (option) this.choose(option.dataset.ratingValue);
    });
    root.addEventListener("keydown", event => this.keydown(event));
    root.addEventListener("pointerdown", event => {
      if (event.target.closest("[data-rating-value]")) event.preventDefault();
    });
    root.addEventListener("wheel", event => this.wheel(event), { passive: false });
    root.addEventListener("input", event => {
      if (event.target.matches(".rating-input input")) { this.close(); this.resetWheel(); }
    });
    root.addEventListener("focusout", event => {
      if (event.target.matches(".rating-input input")) this.resetWheel();
      if (this.openControl && !this.openControl.contains(event.relatedTarget)) this.close();
    });
    document.addEventListener("pointerdown", event => {
      if (this.openControl && !this.openControl.contains(event.target)) this.close();
    });
    window.addEventListener("resize", () => this.close());
  }

  close() {
    if (!this.openControl) return;
    const control = this.openControl;
    control.querySelector(".rating-options").hidden = true;
    control.querySelector("input").setAttribute("aria-expanded", "false");
    control.querySelector("input").removeAttribute("aria-activedescendant");
    control.querySelector("button").setAttribute("aria-expanded", "false");
    this.openControl = null;
  }

  open(control) {
    this.close();
    this.openControl = control;
    const input = control.querySelector("input");
    const popup = control.querySelector(".rating-options");
    popup.classList.remove("above");
    popup.hidden = false;
    input.setAttribute("aria-expanded", "true");
    control.querySelector("button").setAttribute("aria-expanded", "true");
    const options = [...popup.children];
    options.forEach(option => option.setAttribute("aria-selected", String(input.value !== "" && Number(input.value) === Number(option.dataset.ratingValue))));
    this.activeIndex = Math.max(PRESETS.indexOf(Number(input.value)), 0);
    this.highlight();
    input.focus({ preventScroll: true });
    const bounds = popup.getBoundingClientRect();
    if (bounds.bottom > window.innerHeight - 8 && control.getBoundingClientRect().top > bounds.height + 8) popup.classList.add("above");
  }

  highlight() {
    const options = [...this.openControl.querySelectorAll("[data-rating-value]")];
    options.forEach((option, index) => option.classList.toggle("highlighted", index === this.activeIndex));
    this.openControl.querySelector("input").setAttribute("aria-activedescendant", options[this.activeIndex].id);
  }

  choose(value) {
    if (!this.openControl?.isConnected) { this.close(); return; }
    const input = this.openControl.querySelector("input");
    this.close();
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus({ preventScroll: true });
  }

  keydown(event) {
    const input = event.target.closest(".rating-input input");
    if (!input) return;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (!this.openControl) this.open(input.closest("[data-rating-control]"));
      else {
        this.activeIndex = (this.activeIndex + (event.key === "ArrowDown" ? 1 : -1) + PRESETS.length) % PRESETS.length;
        this.highlight();
      }
    } else if (event.key === "Enter" && this.openControl) {
      event.preventDefault();
      this.choose(String(PRESETS[this.activeIndex]));
    } else if (event.key === "Escape" || event.key === "Tab") this.close();
  }

  resetWheel() {
    this.wheelInput = null;
    this.wheelDelta = 0;
  }

  wheel(event) {
    const input = event.target.closest(".rating-input input");
    if (!input || document.activeElement !== input || input.value === "" || input.validity.badInput) return;
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0 || value > 100 || event.ctrlKey || !event.deltaY) return;
    event.preventDefault();
    this.close();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
    const now = performance.now();
    if (this.wheelInput !== input || this.wheelFine !== event.shiftKey || now - (this.lastWheelTime ?? 0) > 250 || Math.sign(delta) !== Math.sign(this.wheelDelta)) this.wheelDelta = 0;
    this.lastWheelTime = now;
    this.wheelInput = input;
    this.wheelFine = event.shiftKey;
    this.wheelDelta += delta;
    if (Math.abs(this.wheelDelta) < 100) return;
    const steps = Math.trunc(this.wheelDelta / 100);
    this.wheelDelta -= steps * 100;
    // 保留手動輸入的小數精度，僅消除浮點運算造成的尾數。
    const next = Math.min(100, Math.max(0, Number((value - steps * (event.shiftKey ? 0.1 : 1)).toFixed(10))));
    const remainder = this.wheelDelta;
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    this.wheelInput = input;
    this.wheelFine = event.shiftKey;
    this.wheelDelta = remainder;
  }
}
