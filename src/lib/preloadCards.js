// Preload all card images into the browser cache so they render instantly
// during play. Without this, a card PNG (~100KB) only downloads the first time
// it's shown, which can make the last played card appear after the trick is
// already cleared.

const SUITS = ["acorn", "bell", "heart", "leaf"];
const VALUES = [
  "ace",
  "eight",
  "king",
  "nine",
  "ober",
  "seven",
  "ten",
  "unter",
];

let started = false;

export function preloadCards() {
  if (started || typeof window === "undefined") return;
  started = true;

  const urls = ["/cards/back.png"];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      urls.push(`/cards/${suit}-${value}.png`);
    }
  }

  for (const url of urls) {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}
