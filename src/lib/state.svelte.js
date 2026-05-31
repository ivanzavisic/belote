const SUITS = ["heart", "bell", "acorn", "leaf"];
const VALUES = [
  "seven",
  "eight",
  "nine",
  "ten",
  "unter",
  "ober",
  "king",
  "ace",
];

const SUIT_NAMES = {
  heart: "Srce",
  bell: "Bundeva",
  acorn: "Žir",
  leaf: "Zelena",
};
const VALUE_NAMES = {
  seven: "VII",
  eight: "VIII",
  nine: "IX",
  ten: "X",
  unter: "Unter",
  ober: "Ober",
  king: "Kralj",
  ace: "As",
};

const AVATARS = [
  { id: 0, emoji: "🎰", label: "Casino Boss", bg: "#d4a574" },
  { id: 1, emoji: "🃏", label: "Kartaš", bg: "#cc3333" },
  { id: 2, emoji: "🎲", label: "Sretković", bg: "#33aa33" },
  { id: 3, emoji: "👑", label: "Kralj", bg: "#c9a84c" },
  { id: 4, emoji: "⭐", label: "Zvijezda", bg: "#ccaa00" },
  { id: 5, emoji: "🔥", label: "Vatreni", bg: "#dd6600" },
  { id: 6, emoji: "💎", label: "Dijamant", bg: "#3366cc" },
  { id: 7, emoji: "🖤", label: "Crni Konj", bg: "#444444" },
];

class AppState {
  screen = $state("login");
  user = $state({ nickname: "", avatarId: 0, id: null });
  rooms = $state([]);
  currentRoom = $state(null);
  gameState = $state(null);
  onlineCount = $state(0);
  connected = $state(false);
  error = $state("");
  isDealing = $state(false);
  lastPlayerAction = $state(null);
  belotPrompt = $state(false);
  firebaseUser = $state(null); // Firebase auth user
  playerData = $state(null); // Firestore player data { uid, nickname, wins, losses, abandoned }
  isGuest = $state(false);
  abandonInfo = $state(null); // { abandonedBy, result }
  rematchInfo = $state(null); // { ready: [], total: number }
}

export const appState = new AppState();
export { SUITS, VALUES, SUIT_NAMES, VALUE_NAMES, AVATARS };
