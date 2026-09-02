const STORAGE_KEY = "catchlist-radar-rating-prototype-v1";
const LABELS = ["指標一", "指標二", "指標三", "指標四", "指標五"];
const CENTER = { x: 180, y: 164 };
const RADIUS = 108;
const VIEWBOX = { width: 360, height: 336 };

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(5, Math.max(0, value)) * 10) / 10;
}

function average(values) {
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function axisAngle(index) {
  return -Math.PI / 2 + index * Math.PI * 2 / LABELS.length;
}

function pointAt(index, score, radius = RADIUS) {
  const angle = axisAngle(index);
  const distance = radius * score / 5;
  return {
    x: CENTER.x + Math.cos(angle) * distance,
    y: CENTER.y + Math.sin(angle) * distance,
  };
}

function polygonPoints(values, radius = RADIUS) {
  return values.map((value, index) => {
    const point = pointAt(index, value, radius);
    return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join(" ");
}

function labelPoint(index) {
  const angle = axisAngle(index);
  const distance = RADIUS + 34;
  return {
    x: CENTER.x + Math.cos(angle) * distance,
    y: CENTER.y + Math.sin(angle) * distance + (index === 0 ? -2 : 4),
  };
}

function radarMarkup() {
  const rings = [1, 2, 3, 4, 5]
    .map((level) => `<polygon class="radar-ring${level === 5 ? " outer" : ""}" points="${polygonPoints(Array(5).fill(level))}"></polygon>`)
    .join("");
  const axes = LABELS.map((label, index) => {
    const edge = pointAt(index, 5);
    const text = labelPoint(index);
    return `<line class="radar-axis" x1="${CENTER.x}" y1="${CENTER.y}" x2="${edge.x}" y2="${edge.y}"></line><text class="radar-label" x="${text.x}" y="${text.y}" text-anchor="middle">${label}</text>`;
  }).join("");
  const handles = LABELS.map((label, index) => `<g class="radar-handle" data-radar-axis="${index}"><circle class="radar-hit" r="20"></circle><circle class="radar-node" r="6"></circle><title>${label}</title></g>`).join("");
  return `${rings}${axes}<polygon class="radar-shape" data-radar-shape points=""></polygon>${handles}`;
}

function controlsMarkup() {
  return LABELS.map((label, index) => `<div class="rating-control-row"><label for="ratingValue${index}">${label}</label><div class="rating-stepper"><button type="button" data-rating-adjust="-0.1" data-rating-index="${index}" aria-label="降低${label} 0.1 分">−</button><input id="ratingValue${index}" data-rating-value="${index}" type="number" inputmode="decimal" min="0" max="5" step="0.1" aria-label="${label}評分，滿分 5 分"><button type="button" data-rating-adjust="0.1" data-rating-index="${index}" aria-label="提高${label} 0.1 分">＋</button></div></div>`).join("");
}

export function prototypeRatingKey(media, entryId) {
  return `${media}:${entryId}`;
}

export function loadPrototypeRatings(storage = window.localStorage) {
  try {
    const payload = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
    const ratings = new Map();
    for (const [key, value] of Object.entries(payload)) {
      if (!Array.isArray(value?.values) || value.values.length !== 5) continue;
      const values = value.values.map((score) => clampScore(Number(score)));
      ratings.set(key, { values, overall: average(values) });
    }
    return ratings;
  } catch {
    return new Map();
  }
}

function persistPrototypeRatings(ratings, storage = window.localStorage) {
  const payload = Object.fromEntries([...ratings].map(([key, rating]) => [key, { values: rating.values }]));
  storage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function createRadarRatingController({ dialog, ratings, onChange }) {
  const form = dialog.querySelector("form");
  const svg = dialog.querySelector("[data-rating-radar]");
  const controls = dialog.querySelector("[data-rating-controls]");
  const overall = dialog.querySelector("[data-rating-overall]");
  const clearButton = dialog.querySelector("[data-rating-clear]");
  svg.insertAdjacentHTML("beforeend", radarMarkup());
  controls.innerHTML = controlsMarkup();

  let activeKey = null;
  let values = [3, 3, 3, 3, 3];
  let dragging = null;

  function update() {
    svg.querySelector("[data-radar-shape]").setAttribute("points", polygonPoints(values));
    svg.querySelectorAll("[data-radar-axis]").forEach((handle, index) => {
      const point = pointAt(index, values[index]);
      handle.setAttribute("transform", `translate(${point.x} ${point.y})`);
      handle.setAttribute("role", "slider");
      handle.setAttribute("tabindex", "0");
      handle.setAttribute("aria-label", LABELS[index]);
      handle.setAttribute("aria-valuemin", "0");
      handle.setAttribute("aria-valuemax", "5");
      handle.setAttribute("aria-valuenow", values[index].toFixed(1));
      handle.setAttribute("aria-valuetext", `${values[index].toFixed(1)} 分`);
    });
    controls.querySelectorAll("[data-rating-value]").forEach((input, index) => {
      if (document.activeElement !== input || input.value !== "") input.value = values[index].toFixed(1);
    });
    overall.textContent = average(values).toFixed(1);
  }

  function setScore(index, score) {
    values[index] = clampScore(score);
    update();
  }

  function scoreFromPointer(event, index) {
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * VIEWBOX.width;
    const y = (event.clientY - rect.top) / rect.height * VIEWBOX.height;
    const angle = axisAngle(index);
    const projection = (x - CENTER.x) * Math.cos(angle) + (y - CENTER.y) * Math.sin(angle);
    return projection / RADIUS * 5;
  }

  svg.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-radar-axis]");
    if (!handle) return;
    dragging = Number(handle.dataset.radarAxis);
    svg.setPointerCapture(event.pointerId);
    setScore(dragging, scoreFromPointer(event, dragging));
    event.preventDefault();
  });

  svg.addEventListener("pointermove", (event) => {
    if (dragging == null) return;
    setScore(dragging, scoreFromPointer(event, dragging));
  });
  svg.addEventListener("pointerup", (event) => {
    if (dragging == null) return;
    dragging = null;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  });
  svg.addEventListener("pointercancel", () => { dragging = null; });

  svg.addEventListener("keydown", (event) => {
    const handle = event.target.closest("[data-radar-axis]");
    if (!handle || !["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
    const index = Number(handle.dataset.radarAxis);
    const delta = ["ArrowUp", "ArrowRight"].includes(event.key) ? 0.1 : -0.1;
    setScore(index, values[index] + delta);
    event.preventDefault();
  });

  controls.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rating-adjust]");
    if (!button) return;
    const index = Number(button.dataset.ratingIndex);
    setScore(index, values[index] + Number(button.dataset.ratingAdjust));
  });

  controls.addEventListener("input", (event) => {
    const input = event.target.closest("[data-rating-value]");
    if (!input || input.value === "") return;
    const score = Number(input.value);
    if (Number.isFinite(score)) setScore(Number(input.dataset.ratingValue), score);
  });
  controls.addEventListener("change", (event) => {
    const input = event.target.closest("[data-rating-value]");
    if (!input) return;
    setScore(Number(input.dataset.ratingValue), Number(input.value));
  });

  form.querySelectorAll("[data-rating-close]").forEach((button) => {
    button.addEventListener("click", () => dialog.close());
  });
  form.querySelector("[data-rating-save]").addEventListener("click", () => {
    const rating = { values: [...values], overall: average(values) };
    ratings.set(activeKey, rating);
    persistPrototypeRatings(ratings);
    dialog.close();
    onChange({ type: "save", key: activeKey, rating });
  });
  clearButton.addEventListener("click", () => {
    ratings.delete(activeKey);
    persistPrototypeRatings(ratings);
    dialog.close();
    onChange({ type: "clear", key: activeKey });
  });

  return {
    open({ key, title }) {
      activeKey = key;
      const saved = ratings.get(key);
      values = saved ? [...saved.values] : [3, 3, 3, 3, 3];
      dialog.querySelector("[data-rating-title]").textContent = title;
      clearButton.hidden = !saved;
      update();
      dialog.showModal();
    },
  };
}
