export const favoriteNames = { personal: "個人收藏", shared: "共樂收藏" };

export function favoriteIcon(kind = "personal") {
  const shape = kind === "shared"
    ? '<g fill="none" transform="translate(-1.5 0)"><path d="M17 9V3H5v18l6-4"/><circle cx="15" cy="13" r="2.1"/><circle cx="20.5" cy="13.8" r="1.7"/><path d="M11 21v-1.2a4 4 0 0 1 8 0V21m1-4a3 3 0 0 1 3 3v1"/></g>'
    : '<path d="M6 3h12v18l-6-4-6 4z"/>';
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${shape}</svg>`;
}

export function favoriteKind(entry) {
  return entry.favorite ? entry.favoriteKind ?? "personal" : null;
}
