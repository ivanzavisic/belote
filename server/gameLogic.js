const SUITS = ["heart", "bell", "leaf", "acorn"];
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

// Points
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
const TRUMP_POINTS = {
  seven: 0,
  eight: 0,
  nine: 14,
  ten: 10,
  unter: 20,
  ober: 3,
  king: 4,
  ace: 11,
};

// Strength ordering (index = strength)
const NON_TRUMP_ORDER = [
  "seven",
  "eight",
  "nine",
  "unter",
  "ober",
  "king",
  "ten",
  "ace",
];
const TRUMP_ORDER = [
  "seven",
  "eight",
  "ober",
  "king",
  "ten",
  "ace",
  "nine",
  "unter",
];

// Sequence ordering for zvanja detection
const SEQUENCE_ORDER = [
  "seven",
  "eight",
  "nine",
  "ten",
  "unter",
  "ober",
  "king",
  "ace",
];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function getCardStrength(card, trump) {
  const order = card.suit === trump ? TRUMP_ORDER : NON_TRUMP_ORDER;
  return order.indexOf(card.value);
}

function getCardPoints(card, trump) {
  const pts = card.suit === trump ? TRUMP_POINTS : NON_TRUMP_POINTS;
  return pts[card.value];
}

function getPartnerIndex(idx) {
  return (idx + 2) % 4;
}

function getTeam(idx) {
  return idx % 2; // 0&2 = team 0, 1&3 = team 1
}

// ---------- Trick resolution ----------

function getTrickWinner(trick, trump) {
  let leadSuit = trick[0].card.suit;
  let best = trick[0];
  let bestStrength = getCardStrength(best.card, trump);
  let bestIsTrump = best.card.suit === trump;

  for (let i = 1; i < trick.length; i++) {
    const entry = trick[i];
    const entryIsTrump = entry.card.suit === trump;
    const entryStrength = getCardStrength(entry.card, trump);

    if (bestIsTrump) {
      if (entryIsTrump && entryStrength > bestStrength) {
        best = entry;
        bestStrength = entryStrength;
        bestIsTrump = true;
      }
    } else {
      if (entryIsTrump) {
        best = entry;
        bestStrength = entryStrength;
        bestIsTrump = true;
      } else if (entry.card.suit === leadSuit && entryStrength > bestStrength) {
        best = entry;
        bestStrength = entryStrength;
      }
    }
  }

  return best.playerIndex;
}

function getTrickPoints(trick, trump) {
  let pts = 0;
  for (const entry of trick) {
    pts += getCardPoints(entry.card, trump);
  }
  return pts;
}

// ---------- Valid cards ----------

function getValidCards(hand, trick, trump) {
  if (trick.length === 0) return [...hand];

  const leadSuit = trick[0].card.suit;
  const followCards = hand.filter((c) => c.suit === leadSuit);

  if (leadSuit === trump) {
    // Trump led: must play higher trump if possible, else any trump, else anything
    if (followCards.length === 0) return [...hand];
    const highestTrumpInTrick = Math.max(
      ...trick
        .filter((t) => t.card.suit === trump)
        .map((t) => getCardStrength(t.card, trump)),
    );
    const higherTrumps = followCards.filter(
      (c) => getCardStrength(c, trump) > highestTrumpInTrick,
    );
    return higherTrumps.length > 0 ? higherTrumps : followCards;
  }

  // Non-trump led
  if (followCards.length > 0) return followCards;

  // Can't follow suit
  const trumpCards = hand.filter((c) => c.suit === trump);

  // Check if partner is winning
  const currentWinner = getTrickWinner(trick, trump);
  const partnerIsWinning =
    getTeam(currentWinner) === getTeam(trick[trick.length - 1]?.playerIndex);
  // Actually we need the current player index, not the last entry. Let me adjust this.
  // We don't know current player from this context; the caller should handle it.
  // For now, let's require trumping always unless partner is winning.

  // Simple rule: must play trump if can't follow suit
  // Partner exemption is checked by the caller
  if (trumpCards.length > 0) {
    // Must try to play higher trump than any trump already in trick
    const trumpsInTrick = trick.filter((t) => t.card.suit === trump);
    if (trumpsInTrick.length > 0) {
      const highestTrumpStrength = Math.max(
        ...trumpsInTrick.map((t) => getCardStrength(t.card, trump)),
      );
      const higherTrumps = trumpCards.filter(
        (c) => getCardStrength(c, trump) > highestTrumpStrength,
      );
      return higherTrumps.length > 0 ? higherTrumps : trumpCards;
    }
    return trumpCards;
  }

  return [...hand]; // No trump, play anything
}

function getValidCardsForPlayer(hand, trick, trump, playerIndex) {
  if (trick.length === 0) return [...hand];

  const leadSuit = trick[0].card.suit;
  const followCards = hand.filter((c) => c.suit === leadSuit);

  if (followCards.length > 0) {
    if (leadSuit === trump) {
      const highestTrumpInTrick = Math.max(
        ...trick
          .filter((t) => t.card.suit === trump)
          .map((t) => getCardStrength(t.card, trump)),
      );
      const higherTrumps = followCards.filter(
        (c) => getCardStrength(c, trump) > highestTrumpInTrick,
      );
      return higherTrumps.length > 0 ? higherTrumps : followCards;
    }
    return followCards;
  }

  // Can't follow suit - check partner exemption
  const partnerIdx = getPartnerIndex(playerIndex);
  const currentWinner = getTrickWinner(trick, trump);
  const partnerIsWinning = currentWinner === partnerIdx;

  if (partnerIsWinning) {
    return [...hand]; // Partner winning, play anything
  }

  const trumpCards = hand.filter((c) => c.suit === trump);
  if (trumpCards.length === 0) return [...hand];

  // Must try to overtrump
  const trumpsInTrick = trick.filter((t) => t.card.suit === trump);
  if (trumpsInTrick.length > 0) {
    const highestStr = Math.max(
      ...trumpsInTrick.map((t) => getCardStrength(t.card, trump)),
    );
    const higher = trumpCards.filter(
      (c) => getCardStrength(c, trump) > highestStr,
    );
    return higher.length > 0 ? higher : trumpCards;
  }

  return trumpCards;
}

// ---------- Zvanja (Declarations) ----------

function findSequences(hand) {
  const seqs = [];
  const bySuit = {};
  for (const suit of SUITS) {
    bySuit[suit] = hand
      .filter((c) => c.suit === suit)
      .sort(
        (a, b) =>
          SEQUENCE_ORDER.indexOf(a.value) - SEQUENCE_ORDER.indexOf(b.value),
      );
  }

  for (const suit of SUITS) {
    const cards = bySuit[suit];
    if (cards.length < 3) continue;

    let run = [cards[0]];
    for (let i = 1; i < cards.length; i++) {
      const prevIdx = SEQUENCE_ORDER.indexOf(cards[i - 1].value);
      const currIdx = SEQUENCE_ORDER.indexOf(cards[i].value);
      if (currIdx === prevIdx + 1) {
        run.push(cards[i]);
      } else {
        if (run.length >= 3) seqs.push({ cards: [...run], suit });
        run = [cards[i]];
      }
    }
    if (run.length >= 3) seqs.push({ cards: [...run], suit });
  }

  return seqs;
}

function findFourOfAKind(hand) {
  const groups = [];
  const byValue = {};
  for (const card of hand) {
    if (!byValue[card.value]) byValue[card.value] = [];
    byValue[card.value].push(card);
  }

  for (const value of VALUES) {
    if (value === "seven" || value === "eight") continue; // No zvanja for 7s and 8s
    if (byValue[value] && byValue[value].length === 4) {
      groups.push({ value, cards: byValue[value] });
    }
  }

  return groups;
}

function getSequencePoints(length) {
  if (length === 3) return 20;
  if (length === 4) return 50;
  return 100; // 5+
}

function getSequenceName(length) {
  if (length === 3) return "Terca";
  if (length === 4) return "Kvarta";
  if (length === 5) return "Kvinta";
  return `Sekvenca(${length})`;
}

function getFourOfAKindPoints(value) {
  if (value === "unter") return 200;
  if (value === "nine") return 150;
  return 100;
}

function compareSequences(seqA, seqB, trump) {
  // Longer wins
  if (seqA.cards.length !== seqB.cards.length) {
    return seqA.cards.length - seqB.cards.length;
  }
  // Same length: higher top card wins
  const topA = SEQUENCE_ORDER.indexOf(seqA.cards[seqA.cards.length - 1].value);
  const topB = SEQUENCE_ORDER.indexOf(seqB.cards[seqB.cards.length - 1].value);
  if (topA !== topB) return topA - topB;
  // Same top: trump suit wins
  if (seqA.suit === trump) return 1;
  if (seqB.suit === trump) return -1;
  return 0;
}

function resolveZvanja(hands, trump) {
  const teamZvanja = [
    { sequences: [], groups: [], points: 0, details: [] },
    { sequences: [], groups: [], points: 0, details: [] },
  ];

  const allSequences = [[], []]; // by team
  const allGroups = [[], []];

  for (let i = 0; i < 4; i++) {
    const team = getTeam(i);
    const seqs = findSequences(hands[i]);
    const groups = findFourOfAKind(hands[i]);
    allSequences[team].push(...seqs);
    allGroups[team].push(...groups);
  }

  // Compare best sequences between teams
  let team0Best =
    allSequences[0].length > 0
      ? allSequences[0].reduce((best, s) =>
          compareSequences(s, best, trump) > 0 ? s : best,
        )
      : null;
  let team1Best =
    allSequences[1].length > 0
      ? allSequences[1].reduce((best, s) =>
          compareSequences(s, best, trump) > 0 ? s : best,
        )
      : null;

  let seqWinner = -1;
  if (team0Best && team1Best) {
    const cmp = compareSequences(team0Best, team1Best, trump);
    seqWinner = cmp >= 0 ? 0 : 1;
  } else if (team0Best) {
    seqWinner = 0;
  } else if (team1Best) {
    seqWinner = 1;
  }

  // Award sequence points only to winning team
  if (seqWinner >= 0) {
    for (const seq of allSequences[seqWinner]) {
      const pts = getSequencePoints(seq.cards.length);
      teamZvanja[seqWinner].points += pts;
      teamZvanja[seqWinner].details.push({
        name: getSequenceName(seq.cards.length),
        points: pts,
        cards: seq.cards,
      });
    }
  }

  // Four-of-a-kind always counts for both teams
  for (let team = 0; team < 2; team++) {
    for (const group of allGroups[team]) {
      const pts = getFourOfAKindPoints(group.value);
      teamZvanja[team].points += pts;
      teamZvanja[team].details.push({
        name: `4× ${VALUE_NAMES[group.value]}`,
        points: pts,
        cards: group.cards,
      });
    }
  }

  return teamZvanja;
}

// ---------- Belot detection ----------

function checkBelot(hand, card, trump) {
  if (card.suit !== trump) return false;
  if (card.value !== "king" && card.value !== "ober") return false;
  const other = card.value === "king" ? "ober" : "king";
  return hand.some((c) => c.suit === trump && c.value === other);
}

// ---------- Game State ----------

function createGameState(players, settings, dealer) {
  const deck = shuffleDeck(createDeck());
  const hands = [[], [], [], []];
  for (let i = 0; i < 32; i++) {
    hands[i % 4].push(deck[i]);
  }
  // Sort hands by suit then value for display
  for (let i = 0; i < 4; i++) {
    hands[i].sort((a, b) => {
      const suitDiff = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
      if (suitDiff !== 0) return suitDiff;
      return SEQUENCE_ORDER.indexOf(a.value) - SEQUENCE_ORDER.indexOf(b.value);
    });
  }

  return {
    phase: "BIDDING",
    dealer,
    currentPlayer: (dealer + 1) % 4,
    trump: null,
    trumpCaller: null,
    hands,
    currentTrick: [],
    tricksWon: [0, 0],
    cardPointsWon: [0, 0],
    scores: players.scores ? [...players.scores] : [0, 0],
    roundCardPoints: [0, 0],
    zvanjaPoints: [0, 0],
    zvanjaDetails: [[], []],
    belotPoints: [0, 0],
    biddingPassed: [false, false, false, false],
    trickNumber: 0,
    lastTrickWinner: null,
    players: players.list,
    settings,
    roundDetails: null,
    winner: null,
    consecutivePasses: 0,
    playerZvanja: [[], [], [], []],
    declaringPlayerIndex: null,
    playerDeclarations: [null, null, null, null],
    declarationsDone: 0,
    roundHistory: players.roundHistory || [],
    roundNumber: players.roundNumber || 1,
  };
}

function getPlayerView(game, playerIndex) {
  const otherHandCounts = game.hands.map((h, i) =>
    i === playerIndex ? -1 : h.length,
  );
  const validCards =
    game.phase === "PLAYING" && game.currentPlayer === playerIndex
      ? getValidCardsForPlayer(
          game.hands[playerIndex],
          game.currentTrick,
          game.trump,
          playerIndex,
        )
      : [];

  return {
    phase: game.phase,
    trump: game.trump,
    trumpCallerIndex: game.trumpCaller,
    currentPlayerIndex: game.currentPlayer,
    dealerIndex: game.dealer,
    myIndex: playerIndex,
    myHand: game.hands[playerIndex],
    otherHandCounts,
    players: game.players.map((p) => ({
      nickname: p.nickname,
      avatarId: p.avatarId,
      isBot: p.isBot,
      cardCount: game.hands[game.players.indexOf(p)]?.length || 0,
    })),
    currentTrick: game.currentTrick,
    scores: game.scores,
    roundCardPoints: game.roundCardPoints,
    zvanjaPoints: game.zvanjaPoints,
    belotPoints: game.belotPoints,
    validCards,
    biddingPassed: game.biddingPassed,
    consecutivePasses: game.consecutivePasses,
    zvpipianja: game.zvanjaDetails,
    roundDetails: game.roundDetails,
    roundHistory: game.roundHistory,
    roundNumber: game.roundNumber,
    declaringPlayerIndex: game.declaringPlayerIndex,
    playerDeclarations: game.playerDeclarations,
    myZvanja: game.playerZvanja ? game.playerZvanja[playerIndex] : [],
    winner: game.winner,
  };
}

// ---------- Game Actions ----------

function processBid(game, playerIndex, suit) {
  if (game.phase !== "BIDDING") return { error: "Nije faza licitacije" };
  if (game.currentPlayer !== playerIndex) return { error: "Nije tvoj red" };

  if (suit === null) {
    // Pass - but last bidder must call
    if (game.consecutivePasses >= 3) {
      return { error: "Zadnji ste i morate zvat!" };
    }
    game.biddingPassed[playerIndex] = true;
    game.consecutivePasses++;

    if (game.consecutivePasses >= 4) {
      // All passed - re-deal
      return { action: "REDEAL" };
    }

    game.currentPlayer = (game.currentPlayer + 1) % 4;
    return { action: "NEXT_BID" };
  }

  // Declare trump
  if (!SUITS.includes(suit)) return { error: "Nevažeća boja" };

  game.trump = suit;
  game.trumpCaller = playerIndex;

  // Detect zvanja for each player individually
  game.playerZvanja = [];
  for (let i = 0; i < 4; i++) {
    const seqs = findSequences(game.hands[i]);
    const groups = findFourOfAKind(game.hands[i]);
    const details = [];
    for (const seq of seqs) {
      details.push({
        type: "sequence",
        name: getSequenceName(seq.cards.length),
        points: getSequencePoints(seq.cards.length),
        cards: seq.cards,
        suit: seq.suit,
      });
    }
    for (const group of groups) {
      details.push({
        type: "group",
        name: `4× ${VALUE_NAMES[group.value]}`,
        points: getFourOfAKindPoints(group.value),
        cards: group.cards,
      });
    }
    game.playerZvanja.push(details);
  }

  game.phase = "DECLARING_ZVANJA";
  game.declaringPlayerIndex = (game.dealer + 1) % 4;
  game.currentPlayer = game.declaringPlayerIndex;
  game.playerDeclarations = [null, null, null, null];
  game.declarationsDone = 0;

  return { action: "TRUMP_DECLARED" };
}

function processDeclaration(game, playerIndex, declares) {
  if (game.phase !== "DECLARING_ZVANJA") return { error: "Nije faza zvanja" };
  if (game.declaringPlayerIndex !== playerIndex)
    return { error: "Nije tvoj red" };

  game.playerDeclarations[playerIndex] =
    declares && game.playerZvanja[playerIndex].length > 0;
  game.declarationsDone++;

  if (game.declarationsDone >= 4) {
    resolveDeclaredZvanja(game);
    const hasZvanja = game.zvanjaPoints[0] > 0 || game.zvanjaPoints[1] > 0;
    if (hasZvanja) {
      game.phase = "SHOWING_ZVANJA";
      return { action: "SHOW_ZVANJA" };
    } else {
      game.phase = "PLAYING";
      game.currentPlayer = (game.dealer + 1) % 4;
      return { action: "START_PLAYING" };
    }
  }

  game.declaringPlayerIndex = (game.declaringPlayerIndex + 1) % 4;
  game.currentPlayer = game.declaringPlayerIndex;
  return { action: "NEXT_DECLARE" };
}

function resolveDeclaredZvanja(game) {
  const teamDetails = [[], []];
  const allSequences = [[], []];
  const allGroups = [[], []];

  for (let i = 0; i < 4; i++) {
    if (!game.playerDeclarations[i]) continue;
    const team = getTeam(i);
    for (const z of game.playerZvanja[i]) {
      if (z.type === "sequence") allSequences[team].push(z);
      else allGroups[team].push(z);
    }
  }

  let seqWinner = -1;
  if (allSequences[0].length > 0 || allSequences[1].length > 0) {
    const best0 =
      allSequences[0].length > 0
        ? allSequences[0].reduce((a, b) =>
            compareSequences(a, b, game.trump) >= 0 ? a : b,
          )
        : null;
    const best1 =
      allSequences[1].length > 0
        ? allSequences[1].reduce((a, b) =>
            compareSequences(a, b, game.trump) >= 0 ? a : b,
          )
        : null;
    if (best0 && best1)
      seqWinner = compareSequences(best0, best1, game.trump) >= 0 ? 0 : 1;
    else if (best0) seqWinner = 0;
    else if (best1) seqWinner = 1;
  }

  const teamZvanjaPoints = [0, 0];
  if (seqWinner >= 0) {
    for (const seq of allSequences[seqWinner]) {
      teamZvanjaPoints[seqWinner] += seq.points;
      teamDetails[seqWinner].push(seq);
    }
  }
  for (let team = 0; team < 2; team++) {
    for (const group of allGroups[team]) {
      teamZvanjaPoints[team] += group.points;
      teamDetails[team].push(group);
    }
  }

  game.zvanjaPoints = teamZvanjaPoints;
  game.zvanjaDetails = teamDetails;
}

function processPlay(game, playerIndex, card) {
  if (game.phase !== "PLAYING") return { error: "Nije faza igranja" };
  if (game.currentPlayer !== playerIndex) return { error: "Nije tvoj red" };

  // Validate card is in hand
  const handIdx = game.hands[playerIndex].findIndex(
    (c) => c.suit === card.suit && c.value === card.value,
  );
  if (handIdx === -1) return { error: "Nemaš tu kartu" };

  // Validate card is a valid play
  const valid = getValidCardsForPlayer(
    game.hands[playerIndex],
    game.currentTrick,
    game.trump,
    playerIndex,
  );
  const isValid = valid.some(
    (c) => c.suit === card.suit && c.value === card.value,
  );
  if (!isValid) return { error: "Ne možeš igrati tu kartu" };

  // Check Belot (king + ober of trump) — don't apply points yet, let player decide
  let belotAvailable = false;
  if (checkBelot(game.hands[playerIndex], card, game.trump)) {
    belotAvailable = true;
  }

  // Remove card from hand
  game.hands[playerIndex].splice(handIdx, 1);

  // Add to current trick
  game.currentTrick.push({ playerIndex, card });

  if (game.currentTrick.length < 4) {
    // Next player
    game.currentPlayer = (game.currentPlayer + 1) % 4;
    return { action: "NEXT_PLAY", belotAvailable, playerIndex };
  }

  // Trick complete
  const winner = getTrickWinner(game.currentTrick, game.trump);
  const pts = getTrickPoints(game.currentTrick, game.trump);
  const winTeam = getTeam(winner);

  game.trickNumber++;
  game.tricksWon[winTeam]++;
  game.cardPointsWon[winTeam] += pts;
  game.roundCardPoints[winTeam] += pts;

  const isLastTrick = game.trickNumber === 8;
  if (isLastTrick) {
    game.roundCardPoints[winTeam] += 10; // Last trick bonus
    game.cardPointsWon[winTeam] += 10;
  }

  game.lastTrickWinner = winner;

  return {
    action: isLastTrick ? "ROUND_OVER" : "TRICK_DONE",
    winner,
    points: pts,
    belotAvailable,
    playerIndex,
    isLastTrick,
  };
}

function finishRound(game) {
  const callerTeam = getTeam(game.trumpCaller);
  const otherTeam = 1 - callerTeam;

  let cardPoints = [...game.cardPointsWon];
  let zvanjaPoints = [...game.zvanjaPoints];
  let belotPoints = [...game.belotPoints];

  let totalRound = [
    cardPoints[0] + zvanjaPoints[0] + belotPoints[0],
    cardPoints[1] + zvanjaPoints[1] + belotPoints[1],
  ];

  let fell = null;

  // Check štiglja (all tricks won by one team)
  if (game.tricksWon[0] === 8 || game.tricksWon[1] === 8) {
    const stigljaTeam = game.tricksWon[0] === 8 ? 0 : 1;
    totalRound[stigljaTeam] += 90;
  }

  // Check if caller team "fell" (didn't get more points)
  if (totalRound[callerTeam] <= totalRound[otherTeam]) {
    // Caller fell - opponent gets everything
    fell = callerTeam;
    totalRound[otherTeam] = totalRound[0] + totalRound[1];
    totalRound[callerTeam] = 0;
  }

  game.scores[0] += totalRound[0];
  game.scores[1] += totalRound[1];

  game.roundDetails = {
    cardPoints,
    zvanjaPoints: [...zvanjaPoints],
    belotPoints: [...belotPoints],
    roundTotal: totalRound,
    fell,
    callerTeam,
  };

  game.roundHistory.push({
    roundNumber: game.roundNumber,
    scores: [...totalRound],
    fell,
    callerTeam,
    trump: game.trump,
  });

  // Check game over
  const target = game.settings.targetScore;
  if (game.scores[0] >= target || game.scores[1] >= target) {
    if (game.scores[0] >= target && game.scores[1] >= target) {
      // Both over - caller team wins if they're over
      game.winner = callerTeam;
    } else {
      game.winner = game.scores[0] >= target ? 0 : 1;
    }
    game.phase = "GAME_OVER";
  } else {
    game.phase = "ROUND_END";
  }

  return game;
}

function startPlaying(game) {
  game.phase = "PLAYING";
  game.currentPlayer = (game.dealer + 1) % 4;
}

export {
  createGameState,
  getPlayerView,
  processBid,
  processDeclaration,
  processPlay,
  finishRound,
  startPlaying,
  getValidCardsForPlayer,
  getCardStrength,
  getCardPoints,
  getTeam,
  getPartnerIndex,
  checkBelot,
  getTrickWinner,
  SUITS,
  VALUES,
  SUIT_NAMES,
  VALUE_NAMES,
  NON_TRUMP_POINTS,
  TRUMP_POINTS,
  NON_TRUMP_ORDER,
  TRUMP_ORDER,
};
