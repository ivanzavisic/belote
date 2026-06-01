<script>
  import { appState, AVATARS, SUIT_NAMES } from '../state.svelte.js';
  import { bid, playCard, declareZvanja, backToLobby, leaveRoom, respondBelot, abandonGame, rematchReady, rematchStart } from '../socket.js';
  import { playShuffleSound, playCardSound, playTurnSound, playPopSound, playWinSound, playRoundEndSound, playTrumpSound } from '../sounds.js';
  import { recordWin, recordLoss, recordAbandon } from '../firebase.js';
  import Card from './Card.svelte';

  let gs = $derived(appState.gameState);
  let room = $derived(appState.currentRoom);

  let isDealing = $state(false);
  let lastRoundNumber = $state(0);
  let roundToast = $state('');
  let selectedCards = $state([]);
  let displayedCardPoints = $state([0, 0]);
  let actionBubbles = $state({}); // { [playerIndex]: { text, cards, key } }
  let suppressDeclaring = $state(false);
  let prevTrickLen = $state(0);

  // Mobile orientation detection
  let isPortrait = $state(false);
  let isMobile = $state(false);

  function checkOrientation() {
    isMobile = window.innerWidth <= 1024 && 'ontouchstart' in window;
    isPortrait = isMobile && window.innerHeight > window.innerWidth;
  }

  $effect(() => {
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  });
  let prevPhase = $state('');
  let turnTimer = $state(15);
  let _timerInterval = null;
  let invalidCardMsg = $state('');

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
  let lastPlayTime = 0;
  function handlePlayCard(card) {
    const now = Date.now();
    if (now - lastPlayTime < 800) return;
    lastPlayTime = now;
    playCard(card);
  }
  function handleBelot(accept) { respondBelot(accept); appState.belotPrompt = false; }

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

  let showAbandonConfirm = $state(false);

  function handleLeave() {
    if (gs && gs.phase !== 'GAME_OVER') {
      showAbandonConfirm = true;
      return;
    }
    leaveRoom();
    appState.currentRoom = null;
    appState.gameState = null;
    appState.screen = 'lobby';
  }

  function confirmAbandon() {
    showAbandonConfirm = false;
    if (appState.firebaseUser && !appState.isGuest) {
      recordAbandon(appState.firebaseUser.uid).catch(() => {});
    }
    abandonGame();
  }

  function cancelAbandon() {
    showAbandonConfirm = false;
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

  let isHost = $derived(room && appState.user.id === room.hostId);
  let myRematchReady = $derived(appState.rematchInfo && appState.rematchInfo.ready.includes(appState.user.id));
  let allReadyForRematch = $derived(appState.rematchInfo && appState.rematchInfo.ready.length >= appState.rematchInfo.total - 1);

  function handleRematchReady() {
    rematchReady();
  }

  function handleRematchStart() {
    rematchStart();
  }

  function handleBackToLobby() {
    appState.rematchInfo = null;
    leaveRoom();
  }

  let activeVisualPos = $derived.by(() => {
    if (!gs) return -1;
    const activePhase = isPlaying || isBidding || isDeclaringZvanja;
    if (!activePhase) return -1;
    const activeIdx = isDeclaringZvanja ? gs.declaringPlayerIndex : gs.currentPlayerIndex;
    if (activeIdx == null) return -1;
    return (activeIdx - gs.myIndex + 4) % 4;
  });

  let trumpCallerName = $derived(
    gs && gs.trumpCallerIndex != null && gs.players[gs.trumpCallerIndex]
      ? gs.players[gs.trumpCallerIndex].nickname
      : null
  );
  let trumpCallerIsMyTeam = $derived(
    gs && gs.trumpCallerIndex != null
      ? (gs.trumpCallerIndex % 2 === gs.myIndex % 2)
      : false
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
    } else {
      // Make sure the toast never lingers once we leave ROUND_END
      roundToast = '';
    }
  });

  // Player action bubbles (pass, zvanja declarations)
  $effect(() => {
    const action = appState.lastPlayerAction;
    if (!action || !gs) return;
    appState.lastPlayerAction = null;

    const visualPos = (action.playerIndex - gs.myIndex + 4) % 4;
    const key = Date.now() + '_' + visualPos;
    const isBid = action.type === 'bid';
    const bubble = {
      text: isBid ? `Ulazim u ${action.text}` : action.text,
      cards: action.cards || null,
      key,
      type: action.type,
      suit: isBid ? (action.suit || null) : null
    };
    actionBubbles = { ...actionBubbles, [visualPos]: bubble };

    const duration = action.type === 'zvanja-show' ? 4500 : (action.type === 'declare' ? null : 2000);
    if (duration) {
      setTimeout(() => {
        actionBubbles = Object.fromEntries(
          Object.entries(actionBubbles).filter(([_, b]) => b.key !== key)
        );
      }, duration);
    }

    // Suppress declaring phase briefly after a trump is called
    if (action.type === 'bid') {
      suppressDeclaring = true;
      setTimeout(() => { suppressDeclaring = false; }, 2500);
    }

    // Sound for bubbles
    if (action.type === 'zvanja-show') playWinSound();
    else if (action.type === 'bid') playTrumpSound();
    else playPopSound();
  });

  // Card played sound — detect new cards in trick
  $effect(() => {
    if (!gs) return;
    // Clear lingering declare bubbles when we leave declaring/showing phase
    if (gs.phase !== 'DECLARING_ZVANJA' && gs.phase !== 'SHOWING_ZVANJA') {
      const hasDeclareBubbles = Object.values(actionBubbles).some(b => b.type === 'declare');
      if (hasDeclareBubbles) {
        actionBubbles = Object.fromEntries(
          Object.entries(actionBubbles).filter(([_, b]) => b.type !== 'declare')
        );
      }
    }
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

  // Record win/loss for authenticated players when game ends
  let statsRecorded = $state(false);
  $effect(() => {
    if (!gs || gs.phase !== 'GAME_OVER' || statsRecorded) return;
    if (!appState.firebaseUser || appState.isGuest) return;
    statsRecorded = true;
    const iWon = gs.winner === myTeam;
    if (iWon) {
      recordWin(appState.firebaseUser.uid).catch(() => {});
    } else {
      recordLoss(appState.firebaseUser.uid).catch(() => {});
    }
  });


</script>

<div class="game-screen">
  {#if isPortrait}
    <div class="rotate-overlay">
      <div class="rotate-content">
        <div class="rotate-icon">📱</div>
        <p class="rotate-text">Okreni mobitel</p>
        <p class="rotate-hint">Igra zahtijeva landscape prikaz</p>
      </div>
    </div>
  {/if}

  {#if gs}
    <!-- Header info strip -->
    <div class="game-header-strip">
      <button class="btn btn-small" onclick={handleLeave}>← NATRAG</button>

      {#if showAbandonConfirm}
        <div class="abandon-overlay">
          <div class="abandon-dialog panel ornate-border animate-in">
            <p class="abandon-msg">Jeste li sigurni da želite napustiti igru?</p>
            <p class="abandon-warn">Igra će se prekinuti za sve igrače.</p>
            <div class="abandon-btns">
              <button class="btn btn-small" onclick={cancelAbandon}>Ne</button>
              <button class="btn btn-small btn-danger" onclick={confirmAbandon}>Da, napusti</button>
            </div>
          </div>
        </div>
      {/if}
      <span class="badge badge-gold">Do {room?.settings?.targetScore || 1001}</span>
      <span class="badge badge-gold">{room?.settings?.prolaz !== false ? 'PROLAZ' : 'DOSTA'}</span>
      <span class="header-room-name">{room?.name || 'Belot'}</span>
    </div>

    <!-- Score sidebar (always visible, outside navbar) -->
    <div class="score-sidebar panel ornate-border">
      <!-- Header -->
      <div class="score-sidebar-header">
        <span class="trump-label">REZULTAT</span>
      </div>

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

          <!-- Active player spotlight -->
          {#if activeVisualPos >= 0}
            <div class="table-spotlight spotlight-{activeVisualPos}"></div>
          {/if}

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

          <!-- Trump indicator on table border (between bottom and right player) -->
          {#if trumpSuitName}
            <div class="table-trump-indicator">
              <img src={getSuitIcon(gs.trump)} alt={trumpSuitName} class="table-trump-icon" />
              {#if trumpCallerName}
                <span class="trump-caller-chip" class:trump-caller-blue={trumpCallerIsMyTeam} class:trump-caller-red={!trumpCallerIsMyTeam}>{trumpCallerName}</span>
              {/if}
            </div>
          {/if}

          <!-- Top player (partner, visual pos 2) -->
          {#if seatedPlayers[2]}
            {@const p = seatedPlayers[2]}
            {@const isActive2 = gs.currentPlayerIndex === p.actualIdx && (isPlaying || isBidding || isDeclaringZvanja)}
            <div class="seat seat-top">
              <div class="seat-cards-row">
                {#each Array(p.cardCount) as _}
                  <Card faceDown={true} small={true} />
                {/each}
              </div>
              <div class="player-circle-wrap">
                <div class="player-circle" class:is-active={isActive2}>
                  {#if isActive2}
                    <svg class="timer-ring" viewBox="0 0 100 100">
                      <circle class="timer-ring-bg" cx="50" cy="50" r="46" />
                      <circle class="timer-ring-progress" class:timer-low={turnTimer <= 5} cx="50" cy="50" r="46"
                        style="stroke-dashoffset: {289.03 - (turnTimer / 15) * 289.03}" />
                    </svg>
                  {/if}
                  <span class="circle-avatar" style="background: {getAvatar(p.player.avatarId).bg}">
                    {p.player.isBot ? '🤖' : getAvatar(p.player.avatarId).emoji}
                  </span>
                </div>
                <span class="circle-name team-blue">{p.player.nickname}</span>
              </div>
              {#if gs.dealerIndex === p.actualIdx}
                <span class="dealer-chip dealer-chip-top">D</span>
              {/if}
              {#if actionBubbles[2]}
                <div class="action-bubble bubble-below animate-bubble-down bubble-type-{actionBubbles[2].type}" key={actionBubbles[2].key}>
                  <span class="bubble-text">{actionBubbles[2].text}{#if actionBubbles[2].suit}<img src={getSuitIcon(actionBubbles[2].suit)} alt="" class="bubble-suit-icon" />{/if}</span>
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
            {@const isActive3 = gs.currentPlayerIndex === p.actualIdx && (isPlaying || isBidding || isDeclaringZvanja)}
            <div class="seat seat-left">
              <div class="seat-cards-row">
                {#each Array(p.cardCount) as _}
                  <Card faceDown={true} small={true} />
                {/each}
              </div>
              <div class="player-circle-wrap">
                <div class="player-circle" class:is-active={isActive3}>
                  {#if isActive3}
                    <svg class="timer-ring" viewBox="0 0 100 100">
                      <circle class="timer-ring-bg" cx="50" cy="50" r="46" />
                      <circle class="timer-ring-progress" class:timer-low={turnTimer <= 5} cx="50" cy="50" r="46"
                        style="stroke-dashoffset: {289.03 - (turnTimer / 15) * 289.03}" />
                    </svg>
                  {/if}
                  <span class="circle-avatar" style="background: {getAvatar(p.player.avatarId).bg}">
                    {p.player.isBot ? '🤖' : getAvatar(p.player.avatarId).emoji}
                  </span>
                </div>
                <span class="circle-name team-red">{p.player.nickname}</span>
                {#if gs.dealerIndex === p.actualIdx}
                  <span class="dealer-chip dealer-chip-left">D</span>
                {/if}
              </div>
              {#if actionBubbles[3]}
                <div class="action-bubble bubble-right animate-bubble-right bubble-type-{actionBubbles[3].type}" key={actionBubbles[3].key}>
                  <span class="bubble-text">{actionBubbles[3].text}{#if actionBubbles[3].suit}<img src={getSuitIcon(actionBubbles[3].suit)} alt="" class="bubble-suit-icon" />{/if}</span>
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
            {@const isActive1 = gs.currentPlayerIndex === p.actualIdx && (isPlaying || isBidding || isDeclaringZvanja)}
            <div class="seat seat-right">
              <div class="seat-cards-row">
                {#each Array(p.cardCount) as _}
                  <Card faceDown={true} small={true} />
                {/each}
              </div>
              <div class="player-circle-wrap">
                <div class="player-circle" class:is-active={isActive1}>
                  {#if isActive1}
                    <svg class="timer-ring" viewBox="0 0 100 100">
                      <circle class="timer-ring-bg" cx="50" cy="50" r="46" />
                      <circle class="timer-ring-progress" class:timer-low={turnTimer <= 5} cx="50" cy="50" r="46"
                        style="stroke-dashoffset: {289.03 - (turnTimer / 15) * 289.03}" />
                    </svg>
                  {/if}
                  <span class="circle-avatar" style="background: {getAvatar(p.player.avatarId).bg}">
                    {p.player.isBot ? '🤖' : getAvatar(p.player.avatarId).emoji}
                  </span>
                </div>
                <span class="circle-name team-red">{p.player.nickname}</span>
                {#if gs.dealerIndex === p.actualIdx}
                  <span class="dealer-chip dealer-chip-right">D</span>
                {/if}
              </div>
              {#if actionBubbles[1]}
                <div class="action-bubble bubble-left animate-bubble-left bubble-type-{actionBubbles[1].type}" key={actionBubbles[1].key}>
                  <span class="bubble-text">{actionBubbles[1].text}{#if actionBubbles[1].suit}<img src={getSuitIcon(actionBubbles[1].suit)} alt="" class="bubble-suit-icon" />{/if}</span>
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
            <div class="player-circle-wrap">
              <div class="player-circle" class:is-active={isMyTurn && (isPlaying || isBidding || isDeclaringZvanja)}>
                {#if isMyTurn && (isPlaying || isBidding || isDeclaringZvanja)}
                  <svg class="timer-ring" viewBox="0 0 100 100">
                    <circle class="timer-ring-bg" cx="50" cy="50" r="46" />
                    <circle class="timer-ring-progress" class:timer-low={turnTimer <= 5} cx="50" cy="50" r="46"
                      style="stroke-dashoffset: {289.03 - (turnTimer / 15) * 289.03}" />
                  </svg>
                {/if}
                <span class="circle-avatar" style="background: {getAvatar(appState.user.avatarId).bg}">
                  {getAvatar(appState.user.avatarId).emoji}
                </span>
              </div>
              <span class="circle-name team-blue">{appState.user.nickname}</span>
            </div>
            {#if gs.dealerIndex === gs.myIndex}
              <span class="dealer-chip dealer-chip-bottom">D</span>
            {/if}
            {#if actionBubbles[0]}
              <div class="action-bubble bubble-bottom animate-bubble bubble-type-{actionBubbles[0].type}" key={actionBubbles[0].key}>
                <span class="bubble-text">{actionBubbles[0].text}{#if actionBubbles[0].suit}<img src={getSuitIcon(actionBubbles[0].suit)} alt="" class="bubble-suit-icon" />{/if}</span>
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
            {#if isMyTurn}
              <div class="bidding-area dialog-appear">
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
                    <button class="btn pass-btn" onclick={handlePass}>Dalje</button>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="table-notify">
                <p>{gs.players[gs.currentPlayerIndex]?.nickname} zove...</p>
              </div>
            {/if}
          {/if}

          <!-- Declaration phase -->
          {#if isDeclaringZvanja && !suppressDeclaring}
            {#if isMyDeclaringTurn}
              <div class="declaring-area dialog-appear">
                <div class="declaring-panel panel ornate-border">
                  <h3>Imaš li zvanje?</h3>
                  {#if selectedCards.length > 0}
                    <button class="btn btn-primary declare-btn" onclick={handleDeclareZvanja}>
                      Zovi
                    </button>
                  {:else}
                    <button class="btn pass-btn" onclick={handlePassZvanja}>Dalje</button>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="table-notify">
                <p>{gs.players[gs.declaringPlayerIndex]?.nickname} — zove</p>
              </div>
            {/if}
          {/if}

          <!-- Playing phase — whose turn (hide once cards are played) -->
          {#if isPlaying && (!gs.currentTrick || gs.currentTrick.length === 0)}
            <div class="table-notify">
              <p>{isMyTurn ? 'Ti igraš...' : `${gs.players[gs.currentPlayerIndex]?.nickname} na potezu...`}</p>
            </div>
          {/if}

          <!-- Bela prompt -->
          {#if appState.belotPrompt}
            <div class="bela-dialog dialog-appear">
              <div class="bela-panel panel ornate-border">
                <h3>Želiš li zvati belu?</h3>
                <p class="bela-info">+20 bodova</p>
                <div class="bela-buttons">
                  <button class="btn btn-primary" onclick={() => handleBelot(true)}>Da</button>
                  <button class="btn pass-btn" onclick={() => handleBelot(false)}>Ne</button>
                </div>
              </div>
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
                  playable={true}
                  onclick={() => {
                    if (isDeclaringZvanja && isMyDeclaringTurn) {
                      toggleCardSelection(card);
                    } else if (isPlaying && isMyTurn) {
                      if (isCardValid(card)) {
                        handlePlayCard(card);
                      } else {
                        invalidCardMsg = 'Ne možeš baciti tu kartu!';
                        setTimeout(() => invalidCardMsg = '', 2000);
                      }
                    }
                  }}
                />
              </div>
            {/each}
          {/if}
        </div>
        {#if invalidCardMsg}
          <div class="invalid-card-toast">{invalidCardMsg}</div>
        {/if}
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

          <div class="rematch-section">
            {#if appState.rematchInfo}
              <p class="rematch-status">Spremni: {appState.rematchInfo.ready.length} / {appState.rematchInfo.total}</p>
            {/if}

            {#if isHost}
              {#if allReadyForRematch}
                <button class="btn btn-success" onclick={handleRematchStart}>🔄 Revanš!</button>
              {:else}
                <button class="btn btn-secondary" disabled>Čekam igrače...</button>
              {/if}
            {:else}
              {#if myRematchReady}
                <button class="btn btn-secondary" disabled>✓ Spreman</button>
              {:else}
                <button class="btn btn-success" onclick={handleRematchReady}>🔄 Revanš?</button>
              {/if}
            {/if}
            <button class="btn btn-primary" onclick={handleBackToLobby}>Izađi iz partije</button>
          </div>
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
      radial-gradient(ellipse at 50% 40%, rgba(201,168,76,0.06) 0%, transparent 60%),
      radial-gradient(ellipse at 20% 80%, rgba(220,53,69,0.03) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 20%, rgba(201,168,76,0.03) 0%, transparent 50%),
      linear-gradient(180deg, #0a0a0e 0%, #141416 50%, #0d0d12 100%);
    position: relative;
    animation: game-bg-breathe 10s ease-in-out infinite;
  }
  @keyframes game-bg-breathe {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.03); }
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
    color: var(--accent-bright);
    letter-spacing: 1px;
    opacity: 0.6;
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
    border-bottom: 1px solid rgba(201,168,76,0.2);
  }
  .score-sidebar-header {
    text-align: center;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(201,168,76,0.2);
  }
  .trump-label {
    font-family: var(--font-display);
    font-size: 0.95rem;
    color: var(--accent-bright);
    letter-spacing: 3px;
    font-weight: 700;
  }

  /* ---- TRUMP INDICATOR ON TABLE BORDER ---- */
  .table-trump-indicator {
    position: absolute;
    bottom: calc(6% - 50px);
    right: calc(12% + 50px);
    z-index: 25;
    width: 78px;
    height: 78px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(26,26,33,0.95), rgba(18,18,22,0.95));
    border: 2px solid rgba(201,168,76,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 14px rgba(201,168,76,0.25), 0 3px 12px rgba(0,0,0,0.4);
  }
  .table-trump-icon {
    width: 58px;
    height: 58px;
    object-fit: contain;
    filter: drop-shadow(0 0 6px rgba(201,168,76,0.35));
  }
  .trump-caller-chip {
    position: absolute;
    bottom: -14px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 8px;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }
  .trump-caller-blue {
    background: rgba(37, 99, 235, 0.7);
    border: 1px solid rgba(96, 165, 250, 0.4);
    color: #e0ecff;
  }
  .trump-caller-red {
    background: rgba(220, 38, 38, 0.7);
    border: 1px solid rgba(252, 129, 129, 0.4);
    color: #ffe0e0;
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
    border-bottom: 1px solid rgba(201,168,76,0.25);
    text-align: center;
  }
  .team-col { min-width: 50px; }
  .scoreboard-table td {
    padding: 5px 10px;
    text-align: center;
    border-bottom: 1px solid rgba(201,168,76,0.08);
    color: var(--cream);
    font-size: 0.9rem;
  }
  .round-num { color: var(--text-dim); font-size: 0.7rem; }
  .round-score { font-weight: 700; }
  .fell-row td { color: var(--neon-red); }

  .current-round-row { background: rgba(201,168,76,0.06); }
  .live-score {
    color: var(--accent-bright) !important;
    animation: live-pulse 2s ease-in-out infinite;
  }
  @keyframes live-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .total-row td {
    border-top: 1px solid var(--accent);
    border-bottom: none;
    padding-top: 6px;
  }
  .total-score {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--accent-bright);
  }

  /* ---- ROUND TOAST ---- */
  .round-toast {
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 300;
    padding: 12px 32px;
    background: linear-gradient(135deg, rgba(26,26,33,0.96), rgba(18,18,22,0.96));
    border: 1.5px solid rgba(201,168,76,0.4);
    color: var(--accent-bright);
    font-family: var(--font-heading);
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: 1.5px;
    pointer-events: none;
    border-radius: 10px;
    box-shadow: 0 0 20px rgba(201,168,76,0.2), 0 4px 16px rgba(0,0,0,0.5);
    backdrop-filter: blur(12px);
  }

  /* ---- MAIN ---- */
  .game-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    padding: 10px 20px 0;
    margin-top: 50px;
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
    background: radial-gradient(ellipse at center, #1c1c22 0%, #131316 60%, #0d0d12 100%);
    border-radius: 40%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid rgba(201,168,76,0.25);
    box-shadow:
      0 0 0 8px rgba(12,12,16,0.8),
      0 0 0 10px rgba(201,168,76,0.12),
      0 0 40px rgba(0,0,0,0.5),
      inset 0 0 60px rgba(0,0,0,0.2);
  }

  /* ---- ACTIVE PLAYER SPOTLIGHT ---- */
  .table-spotlight {
    position: absolute;
    inset: 0;
    border-radius: 40%;
    pointer-events: none;
    z-index: 1;
    opacity: 0.7;
    transition: opacity 0.4s ease;
  }
  .spotlight-0 {
    background: radial-gradient(ellipse 42% 51% at 50% 95%, rgba(0,184,148,0.18) 0%, rgba(0,184,148,0.05) 40%, transparent 70%);
  }
  .spotlight-1 {
    background: radial-gradient(ellipse 51% 42% at 95% 50%, rgba(0,184,148,0.18) 0%, rgba(0,184,148,0.05) 40%, transparent 70%);
  }
  .spotlight-2 {
    background: radial-gradient(ellipse 42% 51% at 50% 5%, rgba(0,184,148,0.18) 0%, rgba(0,184,148,0.05) 40%, transparent 70%);
  }
  .spotlight-3 {
    background: radial-gradient(ellipse 51% 42% at 5% 50%, rgba(0,184,148,0.18) 0%, rgba(0,184,148,0.05) 40%, transparent 70%);
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
  .seat-bottom .player-circle-wrap { margin-top: 5px; }
  .seat-top { top: -145px; left: 50%; transform: translateX(-50%); flex-direction: column; }
  .seat-left { left: -12%; top: 50%; transform: translateY(-50%); flex-direction: column; }
  .seat-right { right: -12%; top: 50%; transform: translateY(-50%); flex-direction: column; }

  .player-circle-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    position: relative;
    z-index: 2;
  }
  .player-circle {
    position: relative;
    width: 94px;
    height: 94px;
    border-radius: 50%;
    border: 2px solid rgba(201,168,76,0.3);
    transition: border-color 0.3s, box-shadow 0.3s;
    box-shadow: 0 3px 12px rgba(0,0,0,0.4);
  }

  /* ---- ACTIVE PLAYER RING ---- */
  .player-circle.is-active {
    border-color: transparent;
    box-shadow:
      0 0 14px 3px rgba(201,168,76,0.4),
      0 0 28px 6px rgba(201,168,76,0.15);
    animation: circle-pulse 2s ease-in-out infinite;
  }
  @keyframes circle-pulse {
    0%, 100% { box-shadow: 0 0 14px 3px rgba(201,168,76,0.4), 0 0 28px 6px rgba(201,168,76,0.15); }
    50% { box-shadow: 0 0 20px 5px rgba(201,168,76,0.6), 0 0 40px 10px rgba(201,168,76,0.25); }
  }

  /* ---- SVG TIMER RING ---- */
  .timer-ring {
    position: absolute;
    inset: -5px;
    width: calc(100% + 10px);
    height: calc(100% + 10px);
    z-index: 3;
    transform: rotate(-90deg);
  }
  .timer-ring-bg {
    fill: none;
    stroke: rgba(201,168,76,0.12);
    stroke-width: 12;
  }
  .timer-ring-progress {
    fill: none;
    stroke: var(--neon-green);
    stroke-width: 10;
    stroke-linecap: round;
    stroke-dasharray: 289.03;
    transition: stroke-dashoffset 1s linear;
    animation: timer-blink 2s ease-in-out infinite;
  }
  @keyframes timer-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
  .timer-ring-progress.timer-low {
    stroke: var(--neon-red);
    animation: ring-flash 0.8s ease-in-out infinite;
  }
  @keyframes ring-flash {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .circle-avatar {
    position: absolute;
    inset: 2px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.1rem;
    z-index: 2;
  }
  .circle-name {
    font-family: var(--font-heading);
    font-size: 0.95rem;
    color: var(--cream);
    white-space: nowrap;
    letter-spacing: 0.5px;
    background: rgba(12,12,16,0.85);
    padding: 4px 14px;
    border-radius: 10px;
    border: 1px solid rgba(201,168,76,0.2);
    font-weight: 600;
  }
  .circle-name.team-blue {
    background: rgba(37, 99, 235, 0.7);
    border-color: rgba(96, 165, 250, 0.4);
    color: #e0ecff;
  }
  .circle-name.team-red {
    background: rgba(220, 38, 38, 0.7);
    border-color: rgba(252, 129, 129, 0.4);
    color: #ffe0e0;
  }

  /* ---- DEALER CHIP ---- */
  .dealer-chip {
    position: absolute;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent-bright), var(--accent));
    color: var(--bg-darkest);
    font-weight: 900;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 3px solid var(--accent-dim);
    z-index: 60;
    box-shadow: 0 2px 8px rgba(201,168,76,0.3), inset 0 1px 2px rgba(255,255,255,0.2);
    animation: dealer-pulse 3.5s ease-in-out infinite;
    pointer-events: none;
  }
  /* Top & bottom: place left of bubble area */
  .dealer-chip-top {
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 8px;
    margin-left: -80px;
  }
  .dealer-chip-bottom {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-left: 80px;
  }
  /* Left & right: place above bubble area */
  .dealer-chip-left {
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-left: 20px;
    margin-top: 20px;
  }
  .dealer-chip-right {
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-right: 8px;
    margin-top: -30px;
  }
  @keyframes dealer-pulse {
    0%, 100% {
      box-shadow: 0 2px 8px rgba(201,168,76,0.3), inset 0 1px 2px rgba(255,255,255,0.2);
    }
    50% {
      box-shadow: 0 2px 10px rgba(201,168,76,0.45), inset 0 1px 2px rgba(255,255,255,0.25);
    }
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
    width: 351px;
    height: 324px;
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
    filter: brightness(1.3) drop-shadow(0 0 8px rgba(201,168,76,0.5));
  }

  /* ---- INVALID CARD TOAST ---- */
  .invalid-card-toast {
    position: absolute;
    bottom: 170px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(180, 40, 40, 0.92);
    color: #fff;
    font-family: var(--font-heading);
    font-size: 1rem;
    padding: 10px 24px;
    border-radius: 8px;
    border: 2px solid #ff6666;
    z-index: 200;
    white-space: nowrap;
    pointer-events: none;
    animation: toast-pop 0.2s ease-out;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  }
  @keyframes toast-pop {
    from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.9); }
    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
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
    color: var(--accent-bright);
    margin-bottom: 12px;
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
    border: 1px solid rgba(201,168,76,0.25);
    background: rgba(18,18,24,0.6);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    color: var(--cream);
    font-family: var(--font-heading);
    font-size: 0.9rem;
  }
  .bid-btn:hover {
    border-color: var(--accent);
    background: rgba(201,168,76,0.12);
    box-shadow: 0 0 12px var(--shadow-accent);
    transform: translateY(-2px);
  }
  .bid-icon {
    width: 38px;
    height: 38px;
    object-fit: contain;
  }
  .pass-btn {
    margin-top: 6px;
    padding: 10px 32px;
    font-size: 1rem;
    letter-spacing: 1.5px;
  }

  /* ---- TABLE NOTIFICATION (centered on table) ---- */
  .table-notify {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 15;
    padding: 12px 32px;
    background: linear-gradient(135deg, rgba(26,26,33,0.92), rgba(18,18,22,0.92));
    border: 1.5px solid rgba(201,168,76,0.25);
    border-radius: 12px;
    text-align: center;
    color: var(--accent-bright);
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.5px;
    box-shadow: 0 0 12px rgba(201,168,76,0.1), 0 4px 12px rgba(0,0,0,0.3);
    backdrop-filter: blur(10px);
    pointer-events: none;
    white-space: nowrap;
  }

  /* ---- DECLARING ZVANJA ---- */
  .declaring-area {
    position: absolute;
    bottom: calc(18% + 80px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
  }

  /* ---- BELA DIALOG ---- */
  .bela-dialog {
    position: absolute;
    bottom: calc(18% + 80px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 55;
  }
  .bela-panel {
    padding: 24px 36px;
    text-align: center;
    min-width: 240px;
  }
  .bela-panel h3 {
    font-family: var(--font-heading);
    color: var(--accent-bright);
    margin-bottom: 6px;
    font-size: 1.2rem;
  }
  .bela-info {
    color: var(--neon-green);
    font-size: 0.85rem;
    margin-bottom: 14px;
    font-weight: 600;
  }
  .bela-buttons {
    display: flex;
    gap: 12px;
    justify-content: center;
  }
  .bela-buttons .btn {
    min-width: 80px;
  }

  /* ---- TRUMP ANNOUNCEMENT ICON ---- */
  .trump-announce-icon {
    width: 28px;
    height: 28px;
    vertical-align: middle;
    margin-left: 6px;
    filter: drop-shadow(0 0 4px rgba(201,168,76,0.4));
  }
  .declaring-panel {
    padding: 28px 40px;
    text-align: center;
    min-width: 260px;
  }
  .declaring-panel h3 {
    font-family: var(--font-heading);
    color: var(--accent-bright);
    margin-bottom: 14px;
    font-size: 1.2rem;
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
    background: rgba(201,168,76,0.04);
  }
  .zvanja-cell {
    color: var(--accent-bright) !important;
    font-size: 0.75rem !important;
    font-weight: 400 !important;
    opacity: 0.8;
  }

  /* ---- ACTION BUBBLES ---- */
  .action-bubble {
    position: absolute;
    background: linear-gradient(135deg, rgba(26,26,33,0.95), rgba(18,18,24,0.95));
    border: 1px solid var(--accent);
    padding: 12px 24px;
    border-radius: 10px;
    z-index: 60;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 0 16px rgba(201,168,76,0.3), 0 4px 16px rgba(0,0,0,0.4);
    backdrop-filter: blur(8px);
  }
  /* Pass — muted gray */
  .bubble-type-pass {
    border-color: #6b6b78;
    background: linear-gradient(135deg, rgba(30,30,34,0.95), rgba(20,20,24,0.95));
    box-shadow: 0 0 10px rgba(107,107,120,0.2), 0 4px 16px rgba(0,0,0,0.4);
  }
  .bubble-type-pass .bubble-text {
    color: #9ca3af;
    text-shadow: none;
  }
  .bubble-type-pass::after {
    border-color: #6b6b78 !important;
  }
  .bubble-below.bubble-type-pass::after { border-color: transparent transparent #6b6b78 transparent !important; }
  .bubble-bottom.bubble-type-pass::after { border-color: #6b6b78 transparent transparent transparent !important; }
  .bubble-right.bubble-type-pass::after { border-color: transparent #6b6b78 transparent transparent !important; }
  .bubble-left.bubble-type-pass::after { border-color: transparent transparent transparent #6b6b78 !important; }
  /* Declare ("Imam X!") — ruby red */
  .bubble-type-declare {
    border-color: #dc3545;
    background: linear-gradient(135deg, rgba(44,16,20,0.95), rgba(28,10,14,0.95));
    box-shadow: 0 0 14px rgba(220,53,69,0.3), 0 4px 16px rgba(0,0,0,0.4);
  }
  .bubble-type-declare .bubble-text {
    color: #f0a0a8;
    text-shadow: 0 0 8px rgba(220,53,69,0.3);
  }
  .bubble-below.bubble-type-declare::after { border-color: transparent transparent #dc3545 transparent !important; }
  .bubble-bottom.bubble-type-declare::after { border-color: #dc3545 transparent transparent transparent !important; }
  .bubble-right.bubble-type-declare::after { border-color: transparent #dc3545 transparent transparent !important; }
  .bubble-left.bubble-type-declare::after { border-color: transparent transparent transparent #dc3545 !important; }
  /* Zvanja-show — bright gold, celebratory */
  .bubble-type-zvanja-show {
    border-color: #e8d48b;
    background: linear-gradient(135deg, rgba(50,42,18,0.95), rgba(30,26,12,0.95));
    box-shadow: 0 0 20px rgba(232,212,139,0.35), 0 4px 16px rgba(0,0,0,0.4);
  }
  .bubble-type-zvanja-show .bubble-text {
    color: #e8d48b;
    text-shadow: 0 0 10px rgba(232,212,139,0.4);
  }
  .bubble-below.bubble-type-zvanja-show::after { border-color: transparent transparent #e8d48b transparent !important; }
  .bubble-bottom.bubble-type-zvanja-show::after { border-color: #e8d48b transparent transparent transparent !important; }
  .bubble-right.bubble-type-zvanja-show::after { border-color: transparent #e8d48b transparent transparent !important; }
  .bubble-left.bubble-type-zvanja-show::after { border-color: transparent transparent transparent #e8d48b !important; }

  /* Belot — green, celebratory */
  .bubble-type-belot {
    border-color: #00b894;
    background: linear-gradient(135deg, rgba(0,60,45,0.95), rgba(0,35,25,0.95));
    box-shadow: 0 0 20px rgba(0,184,148,0.35), 0 4px 16px rgba(0,0,0,0.4);
  }
  .bubble-type-belot .bubble-text {
    color: #00b894;
    text-shadow: 0 0 10px rgba(0,184,148,0.4);
  }
  .bubble-below.bubble-type-belot::after { border-color: transparent transparent #00b894 transparent !important; }
  .bubble-bottom.bubble-type-belot::after { border-color: #00b894 transparent transparent transparent !important; }
  .bubble-right.bubble-type-belot::after { border-color: transparent #00b894 transparent transparent !important; }
  .bubble-left.bubble-type-belot::after { border-color: transparent transparent transparent #00b894 !important; }

  .bubble-text {
    font-family: var(--font-heading);
    font-size: 1.26rem;
    color: var(--accent-bright);
    letter-spacing: 0.5px;
    text-shadow: 0 0 8px rgba(201,168,76,0.3);
    font-weight: 600;
  }
  .bubble-suit-icon {
    width: 1.1em;
    height: 1.1em;
    object-fit: contain;
    vertical-align: -0.18em;
    margin-left: 6px;
    filter: drop-shadow(0 0 4px rgba(201,168,76,0.4));
  }
  .bubble-cards {
    display: flex;
    gap: 3px;
    margin-top: 6px;
    justify-content: center;
    transform: scale(1.32);
    transform-origin: top center;
  }
  .bubble-top {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 4px;
  }
  .action-bubble::after {
    content: '';
    position: absolute;
    width: 0;
    height: 0;
    border-style: solid;
  }
  .bubble-below {
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 10px;
  }
  .bubble-below::after {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-width: 0 8px 8px 8px;
    border-color: transparent transparent var(--accent) transparent;
  }
  .bubble-bottom {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 10px;
  }
  .bubble-bottom::after {
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-width: 8px 8px 0 8px;
    border-color: var(--accent) transparent transparent transparent;
  }
  .bubble-right {
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-left: 10px;
  }
  .bubble-right::after {
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    border-width: 8px 8px 8px 0;
    border-color: transparent var(--accent) transparent transparent;
  }
  .bubble-left {
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-right: 10px;
  }
  .bubble-left::after {
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    border-width: 8px 0 8px 8px;
    border-color: transparent transparent transparent var(--accent);
  }
  .animate-bubble {
    animation: bubble-pop-up 0.25s ease-out;
  }
  .animate-bubble-down {
    animation: bubble-pop-down 0.25s ease-out;
  }
  .animate-bubble-right {
    animation: bubble-pop-right 0.25s ease-out;
  }
  .animate-bubble-left {
    animation: bubble-pop-left 0.25s ease-out;
  }
  @keyframes bubble-pop-up {
    from { opacity: 0; transform: translateX(-50%) translateY(6px) scale(0.85); }
    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  }
  @keyframes bubble-pop-down {
    from { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(0.85); }
    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  }
  @keyframes bubble-pop-right {
    from { opacity: 0; transform: translateY(-50%) translateX(-6px) scale(0.85); }
    to { opacity: 1; transform: translateY(-50%) translateX(0) scale(1); }
  }
  @keyframes bubble-pop-left {
    from { opacity: 0; transform: translateY(-50%) translateX(6px) scale(0.85); }
    to { opacity: 1; transform: translateY(-50%) translateX(0) scale(1); }
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
    border: 1px solid rgba(201,168,76,0.2);
    text-align: center;
    border-radius: 8px;
  }
  .round-end-text {
    font-family: var(--font-mono);
    font-size: 1rem;
    color: var(--cream);
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .re-divider { color: var(--text-dim); }
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
    color: var(--accent-bright);
    font-weight: 700;
  }

  .rematch-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
  }
  .rematch-status {
    font-size: 0.9rem;
    color: var(--text-muted);
  }
  .btn-success {
    background: var(--neon-green);
    color: #111;
    font-weight: 700;
    border: none;
    padding: 10px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
  }
  .btn-success:hover {
    filter: brightness(1.1);
  }

  /* Abandon confirm dialog */
  .abandon-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    backdrop-filter: blur(3px);
  }
  .abandon-dialog {
    padding: 28px 32px;
    text-align: center;
    max-width: 360px;
  }
  .abandon-msg {
    font-family: var(--font-heading);
    font-size: 1.1rem;
    color: var(--cream);
    margin-bottom: 8px;
  }
  .abandon-warn {
    font-size: 0.8rem;
    color: var(--text-dim);
    margin-bottom: 20px;
  }
  .abandon-btns {
    display: flex;
    gap: 12px;
    justify-content: center;
  }
  .btn-danger {
    background: linear-gradient(180deg, #dc3545, #a71d2a) !important;
    border-color: #dc3545 !important;
    color: white !important;
  }
  .btn-danger:hover {
    background: linear-gradient(180deg, #e04555, #b72735) !important;
  }

  /* Rotate overlay for portrait mobile */
  .rotate-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(10, 10, 14, 0.97);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(12px);
  }
  .rotate-content {
    text-align: center;
  }
  .rotate-icon {
    font-size: 4rem;
    animation: rotate-phone 2s ease-in-out infinite;
    margin-bottom: 20px;
  }
  .rotate-text {
    font-family: var(--font-heading);
    font-size: 1.4rem;
    color: var(--accent-bright);
    letter-spacing: 3px;
    margin-bottom: 8px;
  }
  .rotate-hint {
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  @keyframes rotate-phone {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(90deg); }
    50%, 75% { transform: rotate(90deg); }
  }

  /* ============================================================
     MOBILE LANDSCAPE — shrink everything so a full hand of cards,
     the table and all four seats fit on a phone screen.
     ============================================================ */
  @media (orientation: landscape) and (max-height: 520px) {
    /* Header */
    .game-header-strip {
      top: 4px;
      left: 6px;
      gap: 5px;
    }
    .game-header-strip .badge {
      font-size: 0.55rem;
      padding: 2px 6px;
    }
    .header-room-name { display: none; }

    /* Score sidebar */
    .score-sidebar {
      top: 4px;
      right: 4px;
      width: 132px;
      padding: 6px 8px;
      max-height: calc(100vh - 16px);
    }
    .score-sidebar-header { margin-bottom: 4px; padding-bottom: 4px; }
    .trump-label { font-size: 0.65rem; letter-spacing: 1.5px; }
    .scoreboard-table th { font-size: 0.7rem; padding: 2px 5px; }
    .team-col { min-width: 28px; }
    .scoreboard-table td { padding: 1px 5px; font-size: 0.65rem; }
    .round-num { font-size: 0.55rem; }
    .total-score { font-size: 0.85rem; }

    /* Main area */
    .game-main {
      margin-top: 30px;
      padding: 2px 8px 0;
    }
    .table-area { max-width: 440px; }
    .table-felt { max-width: 440px; }

    /* Seats */
    .seat-bottom { bottom: -42px; }
    .seat-top {
      top: -84px;
    }
    /* Keep the circle centered on the table; float the cards to its right */
    .seat-top .seat-cards-row {
      position: absolute;
      left: 100%;
      top: 14px;
      margin-bottom: 0;
      margin-left: 4px;
    }
    .seat-left { left: -7%; }
    .seat-right { right: -7%; }

    .player-circle { width: 41px; height: 41px; }
    .circle-avatar { font-size: 0.9rem; }
    .circle-name {
      font-size: 0.58rem;
      padding: 2px 7px;
      border-radius: 7px;
    }
    .timer-ring-bg { stroke-width: 8; }
    .timer-ring-progress { stroke-width: 7; }

    /* Opponent cards (top/left/right seats) — smaller to free table space */
    .seat-top :global(.card),
    .seat-top :global(.card-back),
    .seat-left :global(.card),
    .seat-left :global(.card-back),
    .seat-right :global(.card),
    .seat-right :global(.card-back) {
      width: 16px;
      height: 26px;
    }

    .dealer-chip {
      width: 22px;
      height: 22px;
      font-size: 0.62rem;
      border-width: 2px;
    }
    .dealer-chip-top, .dealer-chip-bottom { margin-left: -38px; }
    /* North player's dealer chip: 10px left and 10px down */
    .dealer-chip-top { margin-top: 14px; margin-left: -48px; }
    .dealer-chip-bottom { margin-bottom: 4px; }
    .dealer-chip-left, .dealer-chip-right { margin-top: -16px; }

    .seat-cards-row > :global(*) { margin-left: -8px; }

    /* Action bubbles ("Dalje!", "Imam 20!" ...) — much smaller */
    .action-bubble {
      padding: 4px 9px;
      border-radius: 7px;
    }
    .bubble-text { font-size: 0.62rem; letter-spacing: 0.3px; }
    .bubble-cards { gap: 1px; margin-top: 3px; transform: scale(0.85); }
    .bubble-below { margin-top: 5px; }
    .bubble-bottom { margin-bottom: 5px; }
    .action-bubble::after { border-width: 0 5px 5px 5px; }
    .bubble-below::after { border-width: 0 5px 5px 5px; }

    /* Trump indicator */
    .table-trump-indicator {
      width: 37px;
      height: 37px;
      bottom: -18px;
      right: calc(30% - 60px);
      border-width: 1.5px;
    }
    .table-trump-icon { width: 28px; height: 28px; }
    .trump-caller-chip { font-size: 0.5rem; padding: 1px 5px; bottom: -10px; }

    /* Trick area */
    .trick-area { width: 190px; height: 156px; }
    /* North player's played card up 15px so it doesn't overlap south's */
    .trick-top { top: -10px; }

    /* General table-center notifications ("X zove...", "Ti igraš...") */
    .table-notify {
      padding: 5px 14px;
      font-size: 0.62rem;
      border-radius: 8px;
      border-width: 1px;
    }

    /* My hand */
    .my-hand-area { padding: 2px 0 4px; }
    .hand-card-wrap { margin-left: -10px; }
    .zvanja-highlight { transform: translateY(-12px); }

    /* On-table panels (bidding / declaring / notify) */
    .bidding-panel { padding: 8px 12px; min-width: 0; }
    .declaring-panel { padding: 8px 12px; min-width: 0; }
    .bidding-panel h3, .declaring-panel h3 { font-size: 0.8rem; margin-bottom: 6px; }
    .bid-options { gap: 6px; margin-bottom: 8px; }
    .bid-icon { width: 22px; height: 22px; }
    /* Let text dictate width, but keep the font small to save screen space */
    .bid-btn {
      padding: 6px 10px;
      gap: 4px;
      font-size: 0.55rem;
    }
    .pass-btn { padding: 5px 18px; font-size: 0.72rem; margin-top: 4px; }
    /* Lower the bidding dialog 20px */
    .bidding-area { bottom: calc(18% + 20px - 20px); }
    /* Lower the "Imaš li zvanje?" dialog so it sits centered on the table */
    .declaring-area { bottom: calc(18% + 80px - 50px); }

    /* Round toast — move to bottom-right corner where there's free space
       so it never covers the north player */
    .round-toast {
      top: auto;
      left: auto;
      bottom: 8px;
      right: 8px;
      transform: none;
      padding: 6px 14px;
      font-size: 0.7rem;
      letter-spacing: 0.5px;
      border-radius: 8px;
    }
  }
</style>
