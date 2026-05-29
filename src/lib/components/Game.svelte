<script>
  import { appState, AVATARS, SUIT_NAMES } from '../state.svelte.js';
  import { bid, playCard, declareZvanja, backToLobby, leaveRoom } from '../socket.js';
  import { playShuffleSound, playCardSound, playTurnSound, playPopSound, playWinSound, playRoundEndSound, playTrumpSound } from '../sounds.js';
  import Card from './Card.svelte';

  let gs = $derived(appState.gameState);
  let room = $derived(appState.currentRoom);

  let isDealing = $state(false);
  let lastRoundNumber = $state(0);
  let roundToast = $state('');
  let selectedCards = $state([]);
  let displayedCardPoints = $state([0, 0]);
  let actionBubbles = $state({}); // { [playerIndex]: { text, cards, key } }
  let prevTrickLen = $state(0);
  let prevPhase = $state('');
  let turnTimer = $state(15);
  let _timerInterval = null;

  function getAvatar(id) {
    return AVATARS[id] || AVATARS[0];
  }

  function getSeatedPlayers() {
    if (!gs) return [];
    const positions = [];
    for (let i = 0; i < 4; i++) {
      const actualIdx = (gs.myIndex + i) % 4;
      positions.push({
        visualPos: i,
        actualIdx,
        player: gs.players[actualIdx],
        cardCount: gs.otherHandCounts ? gs.otherHandCounts[actualIdx] : 0
      });
    }
    return positions;
  }

  let seatedPlayers = $derived(getSeatedPlayers());

  function isCardValid(card) {
    if (!gs || !gs.validCards) return false;
    return gs.validCards.some(vc => vc.suit === card.suit && vc.value === card.value);
  }

  function isZvanjaCard(card) {
    if (!gs || !gs.myZvanja) return false;
    return gs.myZvanja.some(z => z.cards.some(c => c.suit === card.suit && c.value === card.value));
  }

  function getTrickCard(actualIdx) {
    if (!gs || !gs.currentTrick) return null;
    const entry = gs.currentTrick.find(t => t.playerIndex === actualIdx);
    return entry ? entry.card : null;
  }

  function handleBid(suit) { bid(suit); }
  function handlePass() { bid(null); }
  function handlePlayCard(card) { playCard(card); }

  function toggleCardSelection(card) {
    const idx = selectedCards.findIndex(c => c.suit === card.suit && c.value === card.value);
    if (idx >= 0) {
      selectedCards = selectedCards.filter((_, i) => i !== idx);
    } else {
      selectedCards = [...selectedCards, card];
    }
  }

  function isCardSelected(card) {
    return selectedCards.some(c => c.suit === card.suit && c.value === card.value);
  }

  function handleDeclareZvanja() {
    if (selectedCards.length === 0) {
      appState.error = 'Odaberi karte za zvanje!';
      setTimeout(() => appState.error = '', 3000);
      return;
    }
    const allZCards = (gs.myZvanja || []).flatMap(z => z.cards);
    const allValid = selectedCards.every(sc =>
      allZCards.some(c => c.suit === sc.suit && c.value === sc.value)
    );
    if (!allValid) {
      appState.error = 'Odabrane karte nisu valjano zvanje!';
      setTimeout(() => appState.error = '', 3000);
      return;
    }
    declareZvanja(true);
    selectedCards = [];
  }

  function handlePassZvanja() {
    declareZvanja(false);
    selectedCards = [];
  }

  function autoPlayOnTimeout() {
    if (!gs) return;
    if (isPlaying && isMyTurn && gs.validCards?.length > 0) {
      playCard(gs.validCards[0]);
    } else if (isBidding && isMyTurn) {
      bid(null);
    } else if (isDeclaringZvanja && isMyDeclaringTurn) {
      declareZvanja(false);
    }
  }

  function handleLeave() {
    leaveRoom();
    appState.currentRoom = null;
    appState.gameState = null;
    appState.screen = 'lobby';
  }

  let isMyTurn = $derived(gs && gs.currentPlayerIndex === gs.myIndex);
  let isBidding = $derived(gs && gs.phase === 'BIDDING');
  let isPlaying = $derived(gs && gs.phase === 'PLAYING');
  let isRoundEnd = $derived(gs && gs.phase === 'ROUND_END');
  let isGameOver = $derived(gs && gs.phase === 'GAME_OVER');
  let isDeclaringZvanja = $derived(gs && gs.phase === 'DECLARING_ZVANJA');
  let isShowingZvanja = $derived(gs && gs.phase === 'SHOWING_ZVANJA');
  let isMyDeclaringTurn = $derived(isDeclaringZvanja && gs.declaringPlayerIndex === gs.myIndex);

  let myTeam = $derived(gs ? (gs.myIndex % 2 === 0 ? 0 : 1) : 0);
  let otherTeam = $derived(1 - myTeam);
  let trumpSuitName = $derived(gs && gs.trump ? SUIT_NAMES[gs.trump] : null);
  let isLastBidder = $derived(gs && gs.consecutivePasses === 3);

  let trumpCallerName = $derived(
    gs && gs.trumpCallerIndex != null && gs.players[gs.trumpCallerIndex]
      ? gs.players[gs.trumpCallerIndex].nickname
      : null
  );

  let myZvanjaTotal = $derived(
    gs && gs.myZvanja ? gs.myZvanja.reduce((sum, z) => sum + z.points, 0) : 0
  );

  let currentRoundMI = $derived(
    gs ? ((displayedCardPoints[myTeam] || 0) + (gs.belotPoints?.[myTeam] || 0)) : 0
  );
  let currentRoundVI = $derived(
    gs ? ((displayedCardPoints[otherTeam] || 0) + (gs.belotPoints?.[otherTeam] || 0)) : 0
  );

  let zvanjaRowMI = $derived(gs?.zvanjaPoints?.[myTeam] || 0);
  let zvanjaRowVI = $derived(gs?.zvanjaPoints?.[otherTeam] || 0);

  // Flatten shown zvanja cards for SHOWING_ZVANJA phase
  let shownZvanjaCards = $derived.by(() => {
    if (!gs || !gs.zvpipianja) return [];
    const cards = [];
    for (const teamZ of gs.zvpipianja) {
      for (const z of teamZ) {
        if (z.cards) cards.push(...z.cards);
      }
    }
    return cards;
  });

  function getSuitIcon(suit) {
    return `/suit-icons/${suit}-icon@medium.png`;
  }

  const suits = ['heart', 'bell', 'acorn', 'leaf'];

  // Dealing animation on new round
  $effect(() => {
    if (appState.isDealing) {
      isDealing = true;
      playShuffleSound();
      appState.isDealing = false;
      selectedCards = [];
      setTimeout(() => { isDealing = false; }, 1200);
    }
  });

  // Update displayed card points only when trick is cleared (not while 4 cards showing)
  $effect(() => {
    if (gs && gs.roundCardPoints) {
      if (!gs.currentTrick || gs.currentTrick.length < 4) {
        displayedCardPoints = [gs.roundCardPoints[0], gs.roundCardPoints[1]];
      }
    }
  });

  // Round end toast
  $effect(() => {
    if (gs && gs.phase === 'ROUND_END') {
      if (gs.roundDetails?.fell != null) {
        roundToast = gs.roundDetails.fell === myTeam ? 'Pali ste! 💥' : 'Protivnik je pao! 💥';
      } else {
        roundToast = `Runda ${gs.roundNumber} završena`;
      }
      const timer = setTimeout(() => { roundToast = ''; }, 3000);
      return () => clearTimeout(timer);
    }
  });

  // Player action bubbles (pass, zvanja declarations)
  $effect(() => {
    const action = appState.lastPlayerAction;
    if (!action || !gs) return;
    appState.lastPlayerAction = null;

    const visualPos = (action.playerIndex - gs.myIndex + 4) % 4;
    const key = Date.now() + '_' + visualPos;
    const bubble = { text: action.text, cards: action.cards || null, key };
    actionBubbles = { ...actionBubbles, [visualPos]: bubble };

    const duration = action.type === 'zvanja-show' ? 3500 : 2000;
    setTimeout(() => {
      actionBubbles = Object.fromEntries(
        Object.entries(actionBubbles).filter(([_, b]) => b.key !== key)
      );
    }, duration);

    // Sound for bubbles
    if (action.type === 'zvanja-show') playWinSound();
    else if (action.type === 'bid') playTrumpSound();
    else playPopSound();
  });

  // Card played sound — detect new cards in trick
  $effect(() => {
    if (!gs) return;
    const trickLen = gs.currentTrick?.length || 0;
    if (trickLen > prevTrickLen && trickLen > 0) {
      playCardSound();
    }
    prevTrickLen = trickLen;
  });

  // Turn timer — resets when currentPlayerIndex changes
  $effect(() => {
    if (!gs) return;
    const _player = gs.currentPlayerIndex;
    const _phase = gs.phase;
    turnTimer = 15;
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = null;
    if (_phase === 'PLAYING' || _phase === 'BIDDING' || _phase === 'DECLARING_ZVANJA') {
      _timerInterval = setInterval(() => {
        turnTimer = Math.max(0, turnTimer - 1);
        if (turnTimer === 0) {
          clearInterval(_timerInterval);
          _timerInterval = null;
          autoPlayOnTimeout();
        }
      }, 1000);
    }
    return () => { if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; } };
  });

  // Visual position of the current active player
  let activeVisualPos = $derived(gs ? (gs.currentPlayerIndex - gs.myIndex + 4) % 4 : -1);

  // Your turn chime
  $effect(() => {
    if (!gs) return;
    const phase = gs.phase;
    if (phase !== prevPhase) {
      prevPhase = phase;
      if (phase === 'ROUND_END') playRoundEndSound();
    }
    if (gs.currentPlayerIndex === gs.myIndex && (phase === 'PLAYING' || phase === 'BIDDING')) {
      playTurnSound();
    }
  });
</script>

<div class="game-screen">
  {#if gs}
    <!-- Header info strip -->
    <div class="game-header-strip">
      <button class="btn btn-small" onclick={handleLeave}>← NATRAG</button>
      <span class="badge badge-gold">Do {room?.settings?.targetScore || 1001}</span>
      <span class="badge badge-gold">{room?.settings?.prolaz !== false ? 'PROLAZ' : 'DOSTA'}</span>
      <span class="header-room-name">{room?.name || 'Belot'}</span>
    </div>

    <!-- Score sidebar (always visible, outside navbar) -->
    <div class="score-sidebar panel ornate-border">
      <!-- Trump display -->
      {#if trumpSuitName}
        <div class="trump-display">
          <span class="trump-label">ZVANJE</span>
          <img src={getSuitIcon(gs.trump)} alt={trumpSuitName} class="trump-icon-lg" />
          <span class="trump-caller-name">{trumpCallerName}</span>
        </div>
      {:else}
        <div class="trump-display empty">
          <span class="trump-label">ZVANJE</span>
          <span class="trump-placeholder">—</span>
        </div>
      {/if}

      <!-- Scoreboard -->
      <table class="scoreboard-table">
        <thead>
          <tr><th></th><th class="team-col">MI</th><th class="team-col">VI</th></tr>
        </thead>
        <tbody>
          {#if gs.roundHistory && gs.roundHistory.length > 0}
            {#each gs.roundHistory as round, i}
              <tr class:fell-row={round.fell != null}>
                <td class="round-num">{i + 1}.</td>
                <td class="round-score">{round.scores[myTeam]}</td>
                <td class="round-score">{round.scores[otherTeam]}</td>
              </tr>
            {/each}
          {/if}
          <!-- Current round live rows -->
          {#if isPlaying || isDeclaringZvanja || isShowingZvanja || isRoundEnd}
            {#if zvanjaRowMI > 0 || zvanjaRowVI > 0}
              <tr class="current-zvanja-row">
                <td class="round-num">zv.</td>
                <td class="round-score zvanja-cell">{zvanjaRowMI}</td>
                <td class="round-score zvanja-cell">{zvanjaRowVI}</td>
              </tr>
            {/if}
            <tr class="current-round-row">
              <td class="round-num">{(gs.roundHistory?.length || 0) + 1}.</td>
              <td class="round-score live-score">{currentRoundMI}</td>
              <td class="round-score live-score">{currentRoundVI}</td>
            </tr>
          {/if}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td></td>
            <td class="total-score">{gs.scores[myTeam]}</td>
            <td class="total-score">{gs.scores[otherTeam]}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Round toast -->
    {#if roundToast}
      <div class="round-toast animate-in">
        <span>{roundToast}</span>
      </div>
    {/if}

    <!-- Main game area -->
    <main class="game-main">
      <div class="table-area">
        <div class="table-felt">

          <!-- Dealing animation -->
          {#if isDealing}
            <div class="dealing-overlay">
              {#each [0, 1, 2, 3] as seat}
                {#each Array(8) as _, c}
                  <div class="deal-card deal-to-{seat}" style="animation-delay: {c * 0.04 + seat * 0.02}s">
                    <Card faceDown={true} small={true} />
                  </div>
                {/each}
              {/each}
            </div>
          {/if}

          <!-- Top player (partner, visual pos 2) -->
          {#if seatedPlayers[2]}
            {@const p = seatedPlayers[2]}
            <div class="seat seat-top">
              <div class="seat-cards-row">
                {#each Array(p.cardCount) as _}
                  <Card faceDown={true} small={true} />
                {/each}
              </div>
              <div class="player-info-compact" class:is-active={gs.currentPlayerIndex === p.actualIdx}>
                <span class="pi-avatar" style="background: {getAvatar(p.player.avatarId).bg}">
                  {p.player.isBot ? '🤖' : getAvatar(p.player.avatarId).emoji}
                </span>
                <span class="pi-name">{p.player.nickname}</span>
                {#if activeVisualPos === 2 && (isPlaying || isBidding || isDeclaringZvanja)}
                  <span class="turn-timer" class:timer-low={turnTimer <= 5}>{turnTimer}</span>
                {/if}
              </div>
              {#if gs.dealerIndex === p.actualIdx}
                <span class="dealer-chip-table dealer-below">D</span>
              {/if}
              {#if actionBubbles[2]}
                <div class="action-bubble bubble-below animate-bubble-down" key={actionBubbles[2].key}>
                  <span class="bubble-text">{actionBubbles[2].text}</span>
                  {#if actionBubbles[2].cards}
                    <div class="bubble-cards">
                      {#each actionBubbles[2].cards as z}
                        {#each z.cards as card}
                          <Card {card} small={true} />
                        {/each}
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Left player (visual pos 3) -->
          {#if seatedPlayers[3]}
            {@const p = seatedPlayers[3]}
            <div class="seat seat-left">
              <div class="seat-cards-row">
                {#each Array(p.cardCount) as _}
                  <Card faceDown={true} small={true} />
                {/each}
              </div>
              <div class="player-info-compact" class:is-active={gs.currentPlayerIndex === p.actualIdx}>
                <span class="pi-avatar" style="background: {getAvatar(p.player.avatarId).bg}">
                  {p.player.isBot ? '🤖' : getAvatar(p.player.avatarId).emoji}
                </span>
                <span class="pi-name">{p.player.nickname}</span>
                {#if activeVisualPos === 3 && (isPlaying || isBidding || isDeclaringZvanja)}
                  <span class="turn-timer" class:timer-low={turnTimer <= 5}>{turnTimer}</span>
                {/if}
              </div>
              {#if gs.dealerIndex === p.actualIdx}
                <span class="dealer-chip-table dealer-below">D</span>
              {/if}
              {#if actionBubbles[3]}
                <div class="action-bubble bubble-up animate-bubble-up" key={actionBubbles[3].key}>
                  <span class="bubble-text">{actionBubbles[3].text}</span>
                  {#if actionBubbles[3].cards}
                    <div class="bubble-cards">
                      {#each actionBubbles[3].cards as z}
                        {#each z.cards as card}
                          <Card {card} small={true} />
                        {/each}
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Right player (visual pos 1) -->
          {#if seatedPlayers[1]}
            {@const p = seatedPlayers[1]}
            <div class="seat seat-right">
              <div class="seat-cards-row">
                {#each Array(p.cardCount) as _}
                  <Card faceDown={true} small={true} />
                {/each}
              </div>
              <div class="player-info-compact" class:is-active={gs.currentPlayerIndex === p.actualIdx}>
                <span class="pi-avatar" style="background: {getAvatar(p.player.avatarId).bg}">
                  {p.player.isBot ? '🤖' : getAvatar(p.player.avatarId).emoji}
                </span>
                <span class="pi-name">{p.player.nickname}</span>
                {#if activeVisualPos === 1 && (isPlaying || isBidding || isDeclaringZvanja)}
                  <span class="turn-timer" class:timer-low={turnTimer <= 5}>{turnTimer}</span>
                {/if}
              </div>
              {#if gs.dealerIndex === p.actualIdx}
                <span class="dealer-chip-table dealer-below">D</span>
              {/if}
              {#if actionBubbles[1]}
                <div class="action-bubble bubble-up animate-bubble-up" key={actionBubbles[1].key}>
                  <span class="bubble-text">{actionBubbles[1].text}</span>
                  {#if actionBubbles[1].cards}
                    <div class="bubble-cards">
                      {#each actionBubbles[1].cards as z}
                        {#each z.cards as card}
                          <Card {card} small={true} />
                        {/each}
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Bottom seat (me) -->
          <div class="seat seat-bottom">
            <div class="player-info-compact" class:is-active={isMyTurn && (isPlaying || isBidding || isDeclaringZvanja)}>
              <span class="pi-avatar" style="background: {getAvatar(appState.user.avatarId).bg}">
                {getAvatar(appState.user.avatarId).emoji}
              </span>
              <span class="pi-name">{appState.user.nickname}</span>
              {#if activeVisualPos === 0 && (isPlaying || isBidding || isDeclaringZvanja)}
                <span class="turn-timer" class:timer-low={turnTimer <= 5}>{turnTimer}</span>
              {/if}
              {#if isMyTurn && isPlaying}
                <span class="turn-indicator">TVOJ RED!</span>
              {/if}
            </div>
            {#if gs.dealerIndex === gs.myIndex}
              <span class="dealer-chip-table dealer-above">D</span>
            {/if}
            {#if actionBubbles[0]}
              <div class="action-bubble bubble-bottom animate-bubble" key={actionBubbles[0].key}>
                <span class="bubble-text">{actionBubbles[0].text}</span>
                {#if actionBubbles[0].cards}
                  <div class="bubble-cards">
                    {#each actionBubbles[0].cards as z}
                      {#each z.cards as card}
                        <Card {card} small={true} />
                      {/each}
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Trick area -->
          <div class="trick-area">
            {#each [0, 1, 2, 3] as visualPos}
              {@const actualIdx = (gs.myIndex + visualPos) % 4}
              {@const trickCard = getTrickCard(actualIdx)}
              {@const trickPos = ['trick-bottom', 'trick-right', 'trick-top', 'trick-left'][visualPos]}
              {#if trickCard}
                <div class="trick-card {trickPos} trick-animate">
                  <Card card={trickCard} medium={true} />
                </div>
              {/if}
            {/each}
          </div>

          <!-- Bidding panel -->
          {#if isBidding}
            <div class="bidding-area dialog-appear">
              {#if isMyTurn}
                <div class="bidding-panel panel ornate-border">
                  <h3>{isLastBidder ? 'Zadnji ste i morate zvat' : 'Tvoj red na zvanje'}</h3>
                  <div class="bid-options">
                    {#each suits as suit}
                      <button class="bid-btn" onclick={() => handleBid(suit)}>
                        <img src={getSuitIcon(suit)} alt={SUIT_NAMES[suit]} class="bid-icon" />
                        <span>{SUIT_NAMES[suit]}</span>
                      </button>
                    {/each}
                  </div>
                  {#if !isLastBidder}
                    <button class="btn btn-small pass-btn" onclick={handlePass}>Dalje</button>
                  {/if}
                </div>
              {:else}
                <div class="bidding-wait">
                  <p class="pulse">{gs.players[gs.currentPlayerIndex]?.nickname} zove...</p>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Declaration phase -->
          {#if isDeclaringZvanja}
            <div class="declaring-area dialog-appear">
              {#if isMyDeclaringTurn}
                <div class="declaring-panel panel ornate-border">
                  <h3>Zvanje?</h3>
                  {#if selectedCards.length > 0}
                    <button class="btn btn-primary declare-btn" onclick={handleDeclareZvanja}>
                      Zovi!
                    </button>
                  {:else}
                    <button class="btn btn-small" onclick={handlePassZvanja}>Dalje</button>
                  {/if}
                </div>
              {:else}
                <div class="declaring-wait">
                  <p class="pulse">{gs.players[gs.declaringPlayerIndex]?.nickname} — zove</p>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Round end brief display -->
          {#if isRoundEnd && gs.roundDetails}
            <div class="round-end-brief animate-in">
              <div class="round-end-text">
                <span>MI: +{gs.roundDetails.roundTotal[myTeam]}</span>
                <span class="re-divider">|</span>
                <span>VI: +{gs.roundDetails.roundTotal[otherTeam]}</span>
              </div>
              {#if gs.roundDetails.fell != null}
                <span class="fell-badge neon-red">
                  {gs.roundDetails.fell === myTeam ? 'PALI SMO!' : 'PALI SU!'}
                </span>
              {/if}
            </div>
          {/if}

        </div>
      </div>

      <!-- My hand -->
      <div class="my-hand-area">
        <div class="my-hand">
          {#if gs.myHand}
            {#each gs.myHand as card}
              {@const selected = isDeclaringZvanja && isMyDeclaringTurn && isCardSelected(card)}
              <div class="hand-card-wrap" class:zvanja-highlight={selected}>
                <Card
                  {card}
                  playable={(isPlaying && isMyTurn && isCardValid(card)) || (isDeclaringZvanja && isMyDeclaringTurn)}
                  onclick={() => {
                    if (isDeclaringZvanja && isMyDeclaringTurn) {
                      toggleCardSelection(card);
                    } else {
                      handlePlayCard(card);
                    }
                  }}
                />
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </main>

    <!-- Game over modal -->
    {#if isGameOver}
      <div class="modal-overlay">
        <div class="modal animate-in game-over-modal">
          <h2 class="neon-text">🏆 Kraj Igre!</h2>
          <div class="winner-announce">
            <p class="winner-text">
              {gs.winner === myTeam ? '🎉 Pobjedili ste!' : 'Izgubili ste...'}
            </p>
            <p class="final-score">
              {gs.scores[myTeam]} — {gs.scores[otherTeam]}
            </p>
          </div>
          <button class="btn btn-primary" onclick={backToLobby}>Natrag u Predvorje</button>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .game-screen {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(ellipse at center, rgba(13,74,13,0.15) 0%, transparent 70%),
      var(--bg-darkest);
    position: relative;
  }

  /* ---- HEADER STRIP ---- */
  .game-header-strip {
    position: fixed;
    top: 10px;
    left: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 200;
  }
  .header-room-name {
    font-family: var(--font-heading);
    font-size: 0.85rem;
    color: var(--gold);
    letter-spacing: 1px;
    opacity: 0.7;
  }

  /* ---- SCORE SIDEBAR ---- */
  .score-sidebar {
    position: fixed;
    top: 16px;
    right: 16px;
    width: 240px;
    z-index: 150;
    padding: 16px 18px;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
  }

  .trump-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--gold-dark);
  }
  .trump-display.empty { opacity: 0.4; }
  .trump-label {
    font-family: var(--font-display);
    font-size: 0.95rem;
    color: var(--gold-bright);
    letter-spacing: 3px;
    font-weight: 700;
  }
  .trump-icon-lg {
    width: 50px;
    height: 50px;
    object-fit: contain;
    filter: drop-shadow(0 0 8px rgba(255,215,0,0.4));
  }
  .trump-caller-name {
    font-family: var(--font-heading);
    font-size: 0.7rem;
    color: var(--cream);
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .trump-placeholder {
    font-size: 1.5rem;
    color: var(--text-dim);
  }

  .scoreboard-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-mono);
  }
  .scoreboard-table th {
    font-family: var(--font-heading);
    font-size: 1rem;
    color: var(--cream);
    padding: 6px 10px;
    border-bottom: 2px solid var(--gold-dark);
    text-align: center;
  }
  .team-col { min-width: 50px; }
  .scoreboard-table td {
    padding: 5px 10px;
    text-align: center;
    border-bottom: 1px solid rgba(139,115,85,0.15);
    color: var(--cream);
    font-size: 0.9rem;
  }
  .round-num { color: var(--text-dim); font-size: 0.7rem; }
  .round-score { font-weight: 700; }
  .fell-row td { color: var(--neon-red); }

  .current-round-row { background: rgba(255,215,0,0.06); }
  .live-score {
    color: var(--gold-bright) !important;
    animation: live-pulse 2s ease-in-out infinite;
  }
  @keyframes live-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .total-row td {
    border-top: 2px solid var(--gold);
    border-bottom: none;
    padding-top: 6px;
  }
  .total-score {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--gold-bright);
  }

  /* ---- ROUND TOAST ---- */
  .round-toast {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 300;
    padding: 8px 24px;
    background: rgba(0,0,0,0.85);
    border: 1px solid var(--gold-dark);
    color: var(--gold-bright);
    font-family: var(--font-heading);
    font-size: 0.9rem;
    letter-spacing: 1px;
    pointer-events: none;
  }

  /* ---- MAIN ---- */
  .game-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    padding: 10px 20px 0;
    min-height: 0;
  }

  /* ---- TABLE ---- */
  .table-area {
    width: 100%;
    max-width: 900px;
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .table-felt {
    width: 100%;
    max-width: 900px;
    aspect-ratio: 2.2 / 1;
    background: radial-gradient(ellipse at center, #1a6b1a 0%, #0d4a0d 60%, #093509 100%);
    border-radius: 40%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 4px solid #c8a84e;
    box-shadow:
      0 0 0 10px #3d1a00,
      0 0 0 14px #c8a84e,
      0 0 40px rgba(0,0,0,0.5),
      inset 0 0 60px rgba(0,0,0,0.3);
  }

  /* ---- SEATS ---- */
  .seat {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 10;
  }
  .seat-bottom { bottom: -82px; left: 50%; transform: translateX(-50%); }
  .seat-top { top: -80px; left: 50%; transform: translateX(-50%); flex-direction: column; }
  .seat-left { left: -18%; top: 50%; transform: translateY(-50%); flex-direction: column; }
  .seat-right { right: -18%; top: 50%; transform: translateY(-50%); flex-direction: column; }

  .player-info-compact {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 20px;
    background: linear-gradient(145deg, rgba(30,25,18,0.92), rgba(15,12,8,0.95));
    border: 2px solid rgba(139,115,85,0.4);
    border-radius: 8px;
    transition: border-color 0.3s, box-shadow 0.3s;
    position: relative;
    z-index: 2;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }

  /* ---- ANIMATED ACTIVE BORDER ---- */
  .player-info-compact.is-active {
    border-color: rgba(255,215,0,0.8);
    animation: active-glow 1.5s ease-in-out infinite;
  }
  @keyframes active-glow {
    0%, 100% {
      box-shadow:
        0 0 8px 2px rgba(255,215,0,0.3),
        0 0 16px 4px rgba(255,215,0,0.1),
        inset 0 0 4px rgba(255,215,0,0.05);
      border-color: rgba(255,215,0,0.5);
    }
    25% {
      box-shadow:
        4px 0 14px 2px rgba(255,215,0,0.7),
        0 0 24px 6px rgba(255,215,0,0.25),
        inset 0 0 6px rgba(255,215,0,0.1);
      border-color: rgba(255,215,0,0.9);
    }
    50% {
      box-shadow:
        0 0 18px 4px rgba(255,215,0,0.9),
        0 0 35px 10px rgba(255,215,0,0.35),
        inset 0 0 8px rgba(255,215,0,0.15);
      border-color: rgba(255,215,0,1);
    }
    75% {
      box-shadow:
        -4px 0 14px 2px rgba(255,215,0,0.7),
        0 0 24px 6px rgba(255,215,0,0.25),
        inset 0 0 6px rgba(255,215,0,0.1);
      border-color: rgba(255,215,0,0.9);
    }
  }

  .pi-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.35rem;
    border: 2px solid var(--gold-dark);
    flex-shrink: 0;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  }
  .pi-name {
    font-family: var(--font-heading);
    font-size: 0.92rem;
    color: var(--cream);
    white-space: nowrap;
    letter-spacing: 0.5px;
  }

  /* ---- DEALER CHIP (on table) ---- */
  .dealer-chip-table {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #fffbe6, #f0d060);
    color: #3d1a00;
    font-weight: 900;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 3px solid #8b6914;
    box-shadow: 0 3px 10px rgba(0,0,0,0.5), 0 0 8px rgba(255,215,0,0.3);
    z-index: 15;
  }
  .dealer-below {
    margin-top: 6px;
  }
  .dealer-above {
    margin-bottom: 6px;
    order: -1;
  }
  .seat-bottom .dealer-above {
    margin-bottom: 26px;
  }

  /* ---- TURN TIMER ---- */
  .turn-timer {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--gold-bright);
    background: rgba(0,0,0,0.5);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(255,215,0,0.3);
    min-width: 22px;
    text-align: center;
    flex-shrink: 0;
  }
  .turn-timer.timer-low {
    color: var(--neon-red);
    border-color: rgba(255,45,45,0.5);
    animation: timer-pulse 0.8s ease-in-out infinite;
  }
  @keyframes timer-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .turn-indicator {
    font-size: 0.6rem;
    color: var(--gold-bright);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    animation: pulse-text 1s ease-in-out infinite;
  }
  @keyframes pulse-text {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .seat-cards-row {
    display: flex;
    margin-bottom: 2px;
    z-index: 1;
  }
  .seat-cards-row > :global(*) { margin-left: -14px; }
  .seat-cards-row > :global(*:first-child) { margin-left: 0; }

  /* ---- TRICK AREA ---- */
  .trick-area {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 280px;
    height: 260px;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .trick-card { position: absolute; }
  .trick-bottom { bottom: 5px; left: 50%; transform: translateX(-50%); }
  .trick-top { top: 5px; left: 50%; transform: translateX(-50%); }
  .trick-left { left: 5px; top: 50%; transform: translateY(-50%); }
  .trick-right { right: 5px; top: 50%; transform: translateY(-50%); }

  .trick-animate {
    animation: card-play 0.15s ease-out;
  }
  @keyframes card-play {
    from { opacity: 0; transform: translateY(10px) scale(0.85); }
    to { opacity: 1; }
  }
  .trick-bottom.trick-animate { animation-name: card-play-bottom; }
  .trick-top.trick-animate { animation-name: card-play-top; }
  .trick-left.trick-animate { animation-name: card-play-left; }
  .trick-right.trick-animate { animation-name: card-play-right; }
  @keyframes card-play-bottom {
    from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.8); }
    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  }
  @keyframes card-play-top {
    from { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.8); }
    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  }
  @keyframes card-play-left {
    from { opacity: 0; transform: translateY(-50%) translateX(-20px) scale(0.8); }
    to { opacity: 1; transform: translateY(-50%) translateX(0) scale(1); }
  }
  @keyframes card-play-right {
    from { opacity: 0; transform: translateY(-50%) translateX(20px) scale(0.8); }
    to { opacity: 1; transform: translateY(-50%) translateX(0) scale(1); }
  }

  /* ---- MY HAND ---- */
  .my-hand-area {
    flex-shrink: 0;
    padding: 4px 0 8px;
  }
  .my-hand {
    display: flex;
    justify-content: center;
  }
  .hand-card-wrap {
    margin-left: -15px;
    transition: transform 0.3s, filter 0.3s;
  }
  .hand-card-wrap:first-child { margin-left: 0; }

  .zvanja-highlight {
    transform: translateY(-20px);
    filter: brightness(1.3) drop-shadow(0 0 8px rgba(255,215,0,0.5));
  }

  /* ---- DIALOG APPEAR ---- */
  .dialog-appear {
    animation: dialog-slide 0.15s ease-out;
  }
  @keyframes dialog-slide {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  /* ---- BIDDING ---- */
  .bidding-area {
    position: absolute;
    bottom: calc(18% + 20px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
  }
  .bidding-panel {
    padding: 24px 36px;
    text-align: center;
    min-width: 320px;
  }
  .bidding-panel h3 {
    font-family: var(--font-heading);
    color: var(--gold);
    margin-bottom: px;
    font-size: 1.05rem;
    letter-spacing: 1px;
  }
  .bid-options {
    display: flex;
    gap: 12px;
    margin-bottom: 14px;
  }
  .bid-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 18px;
    border: 2px solid var(--gold-dark);
    background: rgba(0,0,0,0.5);
    cursor: pointer;
    transition: all 0.2s;
    color: var(--cream);
    font-family: var(--font-heading);
    font-size: 0.8rem;
  }
  .bid-btn:hover {
    border-color: var(--gold-bright);
    background: rgba(212,165,116,0.15);
    box-shadow: 0 0 10px var(--shadow-gold);
    transform: translateY(-2px);
  }
  .bid-icon {
    width: 38px;
    height: 38px;
    object-fit: contain;
  }
  .pass-btn { margin-top: 4px; }
  .bidding-wait {
    padding: 20px 32px;
    background: rgba(0,0,0,0.7);
    border: 1px solid var(--gold-dark);
    text-align: center;
    color: var(--gold);
    font-family: var(--font-heading);
    font-size: 0.85rem;
  }

  /* ---- DECLARING ZVANJA ---- */
  .declaring-area {
    position: absolute;
    bottom: calc(18% + 80px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
  }
  .declaring-panel {
    padding: 28px 40px;
    text-align: center;
    min-width: 260px;
  }
  .declaring-panel h3 {
    font-family: var(--font-heading);
    color: var(--gold);
    margin-bottom: 14px;
    font-size: 1.1rem;
  }
  .zvanja-list {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
    margin-bottom: 10px;
  }
  .zvanja-badge { font-size: 0.8rem; }
  .declare-btn {
    font-size: 0.85rem;
    padding: 8px 20px;
  }
  .no-zvanja-text {
    color: var(--text-dim);
    margin-bottom: 8px;
    font-size: 0.85rem;
  }
  .declare-hint {
    color: var(--text-dim);
    font-size: 0.75rem;
    margin-bottom: 10px;
  }
  .declare-buttons {
    display: flex;
    gap: 10px;
    justify-content: center;
  }
  .current-zvanja-row {
    background: rgba(255,215,0,0.04);
  }
  .zvanja-cell {
    color: var(--gold) !important;
    font-size: 0.75rem !important;
    font-weight: 400 !important;
    opacity: 0.8;
  }
  .declaring-wait {
    padding: 20px 32px;
    background: rgba(0,0,0,0.7);
    border: 1px solid var(--gold-dark);
    text-align: center;
    color: var(--gold);
    font-family: var(--font-heading);
    font-size: 0.95rem;
  }

  /* ---- ACTION BUBBLES ---- */
  .action-bubble {
    position: absolute;
    background: linear-gradient(135deg, rgba(50,40,10,0.95), rgba(30,25,5,0.95));
    border: 2px solid var(--gold-bright);
    padding: 10px 20px;
    border-radius: 8px;
    z-index: 60;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 0 12px rgba(255,215,0,0.35), 0 4px 16px rgba(0,0,0,0.5);
  }
  .bubble-text {
    font-family: var(--font-heading);
    font-size: 1.1rem;
    color: #ffd700;
    letter-spacing: 0.5px;
    text-shadow: 0 0 6px rgba(255,215,0,0.4);
  }
  .bubble-cards {
    display: flex;
    gap: 3px;
    margin-top: 6px;
    justify-content: center;
    transform: scale(1.15);
    transform-origin: top center;
  }
  .bubble-top {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 4px;
  }
  .bubble-below {
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 4px;
  }
  .bubble-bottom {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 4px;
  }
  .bubble-up {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 4px;
  }
  .animate-bubble {
    animation: bubble-pop-up 0.25s ease-out;
  }
  .animate-bubble-up {
    animation: bubble-pop-up 0.25s ease-out;
  }
  .animate-bubble-down {
    animation: bubble-pop-down 0.25s ease-out;
  }
  @keyframes bubble-pop-up {
    from { opacity: 0; transform: translateX(-50%) translateY(6px) scale(0.85); }
    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  }
  @keyframes bubble-pop-down {
    from { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(0.85); }
    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  }

  /* ---- ROUND END BRIEF ---- */
  .round-end-brief {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 40;
    padding: 12px 28px;
    background: rgba(0,0,0,0.8);
    border: 1px solid var(--gold-dark);
    text-align: center;
  }
  .round-end-text {
    font-family: var(--font-mono);
    font-size: 1rem;
    color: var(--cream);
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .re-divider { color: var(--gold-dark); }
  .fell-badge {
    display: block;
    margin-top: 6px;
    font-family: var(--font-heading);
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 1px;
  }

  /* ---- DEALING ANIMATION ---- */
  .dealing-overlay {
    position: absolute;
    inset: 0;
    z-index: 60;
    pointer-events: none;
  }
  .deal-card {
    position: absolute;
    top: 50%;
    left: 50%;
    opacity: 0;
  }
  .deal-to-0 { animation: deal-bottom 0.3s ease-out forwards; }
  .deal-to-1 { animation: deal-right 0.3s ease-out forwards; }
  .deal-to-2 { animation: deal-top 0.3s ease-out forwards; }
  .deal-to-3 { animation: deal-left 0.3s ease-out forwards; }
  @keyframes deal-bottom {
    from { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
    to { transform: translate(-50%, 120px) scale(1); opacity: 0.8; }
  }
  @keyframes deal-top {
    from { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
    to { transform: translate(-50%, -180px) scale(1); opacity: 0.8; }
  }
  @keyframes deal-left {
    from { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
    to { transform: translate(-250px, -50%) scale(1); opacity: 0.8; }
  }
  @keyframes deal-right {
    from { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
    to { transform: translate(180px, -50%) scale(1); opacity: 0.8; }
  }

  /* ---- GAME OVER ---- */
  .game-over-modal { text-align: center; }
  .winner-announce { margin: 16px 0 20px; }
  .winner-text {
    font-family: var(--font-heading);
    font-size: 1.2rem;
    color: var(--cream);
    margin-bottom: 8px;
  }
  .final-score {
    font-family: var(--font-mono);
    font-size: 2rem;
    color: var(--gold-bright);
    font-weight: 700;
  }
</style>
