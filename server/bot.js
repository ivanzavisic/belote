import {
  getValidCardsForPlayer,
  getCardStrength,
  getCardPoints,
  getTeam,
  getPartnerIndex,
  getTrickWinner,
  SUITS,
  TRUMP_ORDER,
  NON_TRUMP_ORDER,
  TRUMP_POINTS,
} from "./gameLogic.js";

const BOT_NAMES = [
  "Mirko 🤖",
  "Slavko 🤖",
  "Dragica 🤖",
  "Željko 🤖",
  "Barica 🤖",
  "Ivica 🤖",
];
let botCounter = 0;

function getNextBotName() {
  return BOT_NAMES[botCounter++ % BOT_NAMES.length];
}

// ---------- Bidding AI ----------

function botBid(hand) {
  // Evaluate each suit as potential trump
  let bestSuit = null;
  let bestScore = 0;

  for (const suit of SUITS) {
    const suitCards = hand.filter((c) => c.suit === suit);
    if (suitCards.length < 3) continue;

    let score = suitCards.length * 10;

    // Bonus for key trump cards
    if (suitCards.some((c) => c.value === "unter")) score += 30; // Unter = strongest
    if (suitCards.some((c) => c.value === "nine")) score += 20; // IX = second strongest
    if (suitCards.some((c) => c.value === "ace")) score += 10;

    // Bonus for aces in other suits
    for (const c of hand) {
      if (c.suit !== suit && c.value === "ace") score += 8;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSuit = suit;
    }
  }

  // Bid if score is good enough
  if (bestScore >= 50) {
    return bestSuit;
  }

  return null; // Pass
}

// ---------- Playing AI ----------

function botPlay(hand, trick, trump, playerIndex) {
  const valid = getValidCardsForPlayer(hand, trick, trump, playerIndex);
  if (valid.length === 1) return valid[0];

  // Leading
  if (trick.length === 0) {
    return botLeadCard(valid, hand, trump, playerIndex);
  }

  // Following
  return botFollowCard(valid, trick, trump, playerIndex);
}

function botLeadCard(valid, hand, trump, playerIndex) {
  // Prefer to lead with high non-trump cards (aces, tens)
  const nonTrump = valid.filter((c) => c.suit !== trump);
  const trumpCards = valid.filter((c) => c.suit === trump);

  if (nonTrump.length > 0) {
    // Lead with strongest non-trump
    const sorted = nonTrump.sort(
      (a, b) => getCardStrength(b, trump) - getCardStrength(a, trump),
    );
    // Prefer aces
    const aces = sorted.filter((c) => c.value === "ace");
    if (aces.length > 0) return aces[0];
    return sorted[0];
  }

  // Only have trump - play lowest
  return trumpCards.sort(
    (a, b) => getCardStrength(a, trump) - getCardStrength(b, trump),
  )[0];
}

function botFollowCard(valid, trick, trump, playerIndex) {
  const leadSuit = trick[0].card.suit;
  const partnerIdx = getPartnerIndex(playerIndex);
  const currentWinner = getTrickWinner(trick, trump);
  const partnerIsWinning = currentWinner === partnerIdx;

  if (partnerIsWinning) {
    // Partner is winning - play lowest valid card
    return valid.sort(
      (a, b) => getCardStrength(a, trump) - getCardStrength(b, trump),
    )[0];
  }

  // Opponent is winning - try to win
  const winningCard =
    trick[trick.findIndex((t) => t.playerIndex === currentWinner)].card;
  const winningStrength = getCardStrength(winningCard, trump);
  const winningIsTrump = winningCard.suit === trump;

  // Cards that can beat the current winner
  const beaters = valid.filter((c) => {
    const cIsTrump = c.suit === trump;
    const cStr = getCardStrength(c, trump);
    if (winningIsTrump) {
      return cIsTrump && cStr > winningStrength;
    } else {
      if (cIsTrump) return true;
      if (c.suit === leadSuit) return cStr > winningStrength;
      return false;
    }
  });

  if (beaters.length > 0) {
    // Play the lowest winning card
    return beaters.sort(
      (a, b) => getCardStrength(a, trump) - getCardStrength(b, trump),
    )[0];
  }

  // Can't win - play lowest card
  return valid.sort((a, b) => {
    // Prefer discarding low non-trump cards
    const aIsTrump = a.suit === trump;
    const bIsTrump = b.suit === trump;
    if (aIsTrump !== bIsTrump) return aIsTrump ? 1 : -1;
    return getCardPoints(a, trump) - getCardPoints(b, trump);
  })[0];
}

function getCardPoints2(card, trump) {
  if (card.suit === trump) return TRUMP_POINTS[card.value];
  const NON_TRUMP_POINTS = {
    seven: 0,
    eight: 0,
    nine: 0,
    ten: 10,
    unter: 2,
    ober: 3,
    king: 4,
    ace: 11,
  };
  return NON_TRUMP_POINTS[card.value];
}

export { getNextBotName, botBid, botPlay };
