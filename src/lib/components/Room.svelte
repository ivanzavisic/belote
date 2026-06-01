<script>
  import { appState, AVATARS } from '../state.svelte.js';
  import { leaveRoom, addBot, removePlayer, startGame, swapPlayers } from '../socket.js';

  let room = $derived(appState.currentRoom);
  let isHost = $derived(room && room.hostId === appState.user.id);
  let playerCount = $derived(room ? room.players.length : 0);
  let canStart = $derived(playerCount === 4);
  let selectedSeat = $state(null);

  function getAvatar(id) {
    return AVATARS[id] || AVATARS[0];
  }

  function getTeamLabel(index) {
    return index % 2 === 0 ? 'A' : 'B';
  }

  function handleLeave() {
    leaveRoom();
    appState.currentRoom = null;
    appState.screen = 'lobby';
  }

  function handleSeatClick(seatIndex) {
    if (!isHost) return;
    const player = room.players[seatIndex];
    if (selectedSeat === null) {
      // First click: select a seat that has a player (not yourself though — any occupied seat)
      if (player) {
        selectedSeat = seatIndex;
      }
    } else {
      // Second click: swap only if target also has a player
      if (seatIndex !== selectedSeat && player) {
        swapPlayers(selectedSeat, seatIndex);
      }
      selectedSeat = null;
    }
  }

  const seatLabels = ['Jug', 'Istok', 'Sjever', 'Zapad'];
</script>

<div class="room-screen">
  {#if room}
    <header class="room-header panel">
      <button class="btn btn-small" onclick={handleLeave}>← Natrag</button>
      <div class="room-title-section">
        <h1 class="room-name">{room.name}</h1>
        <div class="room-settings-info">
          <span class="badge badge-gold">Do {room.settings.targetScore}</span>
          <span class="badge badge-gold">{room.settings.prolaz ? 'Na prolaz' : 'Na dosta'}</span>
        </div>
      </div>
      <div class="room-player-count">
        {playerCount}/4 igrača
      </div>
    </header>

    <main class="room-main">
      <div class="table-layout">
        <div class="table-felt ornate-border">
          <div class="table-center">
            <p class="table-logo neon-text">BELOT</p>
            <p class="table-sub">Čekanje igrača...</p>
          </div>

          {#each [0, 1, 2, 3] as seatIndex}
            {@const player = room.players[seatIndex]}
            {@const posClass = ['seat-bottom', 'seat-right', 'seat-top', 'seat-left'][seatIndex]}
            <div
              class="seat {posClass}"
              class:occupied={player}
              class:team-a={seatIndex % 2 === 0}
              class:team-b={seatIndex % 2 !== 0}
              class:seat-selected={selectedSeat === seatIndex}
              class:seat-swappable={isHost && selectedSeat !== null && selectedSeat !== seatIndex}
              onclick={() => handleSeatClick(seatIndex)}
              role={isHost ? 'button' : undefined}
              tabindex={isHost ? 0 : undefined}
            >
              {#if player}
                <div class="player-circle-wrap">
                  <div class="player-circle">
                    <span class="circle-avatar" style="background: {getAvatar(player.avatarId).bg}">
                      {player.isBot ? '🤖' : getAvatar(player.avatarId).emoji}
                    </span>
                    {#if isHost && player.isBot}
                      <button class="remove-btn" onclick={() => removePlayer(seatIndex)} title="Ukloni">✕</button>
                    {/if}
                  </div>
                  <span class="circle-name">{player.nickname}</span>
                  <span class="team-badge">Tim {getTeamLabel(seatIndex)}</span>
                </div>
              {:else}
                <div class="player-circle-wrap empty">
                  <div class="player-circle empty-circle">
                    <span class="empty-icon">?</span>
                  </div>
                  <span class="circle-name dim">{seatLabels[seatIndex]}</span>
                  {#if isHost}
                    <button class="btn btn-small btn-green" onclick={addBot}>
                      + Bot
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      {#if isHost}
        <div class="host-controls">
          <button
            class="btn btn-primary start-btn"
            disabled={!canStart}
            onclick={startGame}
          >
            {canStart ? 'Pokreni Igru' : `Trebaš još ${4 - playerCount} igrača`}
          </button>
        </div>
      {:else}
        <div class="host-controls">
          <p class="waiting-text pulse">Čekanje da domaćin pokrene igru...</p>
        </div>
      {/if}
    </main>
  {/if}
</div>

<style>
  .room-screen {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(ellipse at center, rgba(201,168,76,0.06) 0%, transparent 70%),
      radial-gradient(ellipse at 30% 70%, rgba(220,53,69,0.03) 0%, transparent 50%),
      linear-gradient(180deg, #0a0a0e 0%, #141416 100%);
  }

  .room-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    border-bottom: 1px solid rgba(201,168,76,0.15);
    flex-shrink: 0;
  }

  .room-title-section {
    text-align: center;
  }

  .room-name {
    font-family: var(--font-heading);
    font-size: 1.2rem;
    color: var(--accent-bright);
    letter-spacing: 2px;
    font-weight: 600;
  }

  .room-settings-info {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    justify-content: center;
  }

  .room-player-count {
    font-family: var(--font-mono);
    color: var(--cream);
    font-size: 0.9rem;
  }

  .room-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .table-layout {
    width: 100%;
    max-width: 900px;
    position: relative;
  }

  .table-felt {
    width: 100%;
    aspect-ratio: 2.2 / 1;
    background: radial-gradient(ellipse at center, #1c1c22 0%, #131316 60%, #0d0d12 100%);
    border-radius: 40%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid rgba(201,168,76,0.3);
    box-shadow:
      0 0 0 8px rgba(12,12,16,0.8),
      0 0 0 10px rgba(201,168,76,0.15),
      0 0 40px rgba(0,0,0,0.5),
      inset 0 0 60px rgba(0,0,0,0.2);
  }

  .table-center {
    text-align: center;
  }

  .table-logo {
    font-family: var(--font-display);
    font-size: 2rem;
    letter-spacing: 8px;
  }

  .table-sub {
    color: rgba(240,230,208,0.4);
    font-size: 0.85rem;
    margin-top: 8px;
    letter-spacing: 2px;
  }

  .seat {
    position: absolute;
    width: 140px;
    text-align: center;
    cursor: default;
  }

  .seat-selected .player-circle {
    border-color: var(--accent-bright) !important;
    box-shadow: 0 0 20px rgba(201,168,76,0.5), 0 0 40px rgba(201,168,76,0.2) !important;
    animation: selected-glow 1s ease-in-out infinite alternate;
  }
  @keyframes selected-glow {
    from { box-shadow: 0 0 16px rgba(201,168,76,0.4); }
    to { box-shadow: 0 0 28px rgba(201,168,76,0.6); }
  }

  .seat-swappable {
    cursor: pointer;
  }
  .seat-swappable .player-circle {
    border-style: dashed;
    border-color: rgba(201,168,76,0.5);
  }
  .seat-swappable:hover .player-circle {
    border-color: var(--accent-bright);
    box-shadow: 0 0 14px rgba(201,168,76,0.3);
  }

  .seat-bottom { bottom: -30px; left: 50%; transform: translateX(-50%); }
  .seat-top { top: -30px; left: 50%; transform: translateX(-50%); }
  .seat-left { left: -40px; top: 50%; transform: translateY(-50%); }
  .seat-right { right: -40px; top: 50%; transform: translateY(-50%); }

  .player-circle-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }
  .player-circle {
    position: relative;
    width: 79px;
    height: 79px;
    border-radius: 50%;
    border: 2px solid rgba(201,168,76,0.35);
    box-shadow: 0 3px 12px rgba(0,0,0,0.4);
    transition: border-color 0.3s, box-shadow 0.3s;
  }
  .player-circle:hover {
    border-color: var(--accent);
    box-shadow: 0 0 14px rgba(201,168,76,0.25);
  }
  .circle-avatar {
    position: absolute;
    inset: 2px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.8rem;
  }
  .circle-name {
    font-family: var(--font-heading);
    font-size: 0.75rem;
    color: var(--cream);
    white-space: nowrap;
    letter-spacing: 0.5px;
    background: rgba(12,12,16,0.85);
    padding: 2px 10px;
    border-radius: 10px;
    border: 1px solid rgba(201,168,76,0.2);
    font-weight: 500;
  }
  .circle-name.dim {
    color: var(--text-dim);
  }

  .team-badge {
    font-size: 0.6rem;
    padding: 1px 8px;
    border-radius: 4px;
    font-weight: 600;
    letter-spacing: 1px;
  }

  .team-a .team-badge {
    background: rgba(255,71,87,0.15);
    color: var(--neon-red);
    border: 1px solid rgba(255,71,87,0.3);
  }

  .team-b .team-badge {
    background: rgba(156,163,175,0.15);
    color: var(--cyan);
    border: 1px solid rgba(156,163,175,0.3);
  }

  .remove-btn {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,71,87,0.3);
    border: 1px solid var(--neon-red);
    color: var(--neon-red);
    cursor: pointer;
    font-size: 0.6rem;
    z-index: 5;
    backdrop-filter: blur(4px);
  }

  .remove-btn:hover {
    background: rgba(255,71,87,0.5);
  }

  .empty-circle {
    border-style: dashed;
    border-color: rgba(201,168,76,0.25);
    animation: waiting-pulse 2.5s ease-in-out infinite;
  }
  .empty-icon {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.6rem;
    color: var(--text-dim);
    font-weight: 700;
    font-family: var(--font-heading);
  }

  @keyframes waiting-pulse {
    0%, 100% {
      border-color: rgba(201,168,76,0.15);
      box-shadow: 0 0 0 0 rgba(201,168,76,0);
    }
    50% {
      border-color: rgba(201,168,76,0.4);
      box-shadow: 0 0 16px 2px rgba(201,168,76,0.1);
    }
  }

  .host-controls {
    margin-top: 32px;
    text-align: center;
  }

  .start-btn {
    font-size: 1.1rem;
    padding: 16px 40px;
    letter-spacing: 3px;
  }

  .waiting-text {
    color: var(--accent-bright);
    font-family: var(--font-heading);
    letter-spacing: 2px;
  }

  @media (max-width: 600px) {
    .room-header {
      padding: 8px 10px;
      gap: 8px;
    }
    .room-name {
      font-size: 0.95rem;
      letter-spacing: 0.5px;
    }
    .room-title-section {
      flex: 1;
      min-width: 0;
    }
    .room-settings-info {
      flex-wrap: wrap;
      gap: 4px;
    }
    .room-player-count {
      font-size: 0.75rem;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .room-main {
      padding: 24px 16px;
      justify-content: center;
      gap: 8px;
    }
    .table-layout {
      max-width: 100%;
    }
    .table-felt {
      aspect-ratio: 1.25 / 1;
      border-radius: 32%;
    }
    .table-logo {
      font-size: 1.4rem;
      letter-spacing: 4px;
    }
    .table-sub {
      font-size: 0.7rem;
      margin-top: 4px;
    }
    .seat {
      width: 90px;
    }
    .player-circle {
      width: 56px;
      height: 56px;
    }
    .circle-avatar {
      font-size: 1.4rem;
    }
    .circle-name {
      font-size: 0.62rem;
      padding: 2px 8px;
    }
    .player-circle-wrap {
      gap: 4px;
    }
    /* Push seats further out so they don't crowd the table center */
    .seat-bottom { bottom: -54px; }
    .seat-top { top: -54px; }
    .seat-left { left: -16px; }
    .seat-right { right: -16px; }
    .host-controls {
      margin-top: 56px;
    }
    .start-btn {
      font-size: 0.95rem;
      padding: 14px 32px;
      letter-spacing: 2px;
    }
    .waiting-text {
      font-size: 0.85rem;
      letter-spacing: 1px;
    }
  }

  /* ============================================================
     MOBILE LANDSCAPE — short viewport: shrink table & seats so
     all four players and the start button fit without clipping.
     ============================================================ */
  @media (orientation: landscape) and (max-height: 520px) {
    .room-header {
      padding: 6px 12px;
      gap: 8px;
    }
    .room-name {
      font-size: 0.95rem;
      letter-spacing: 1px;
    }
    .room-settings-info {
      gap: 4px;
      margin-top: 2px;
    }
    .room-settings-info .badge {
      font-size: 0.6rem;
      padding: 2px 6px;
    }
    .room-player-count {
      font-size: 0.75rem;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .room-main {
      padding: 10px 16px;
      justify-content: center;
      gap: 0;
    }
    .table-layout {
      max-width: 520px;
    }
    .table-felt {
      aspect-ratio: 2.6 / 1;
    }
    .table-logo {
      font-size: 1.4rem;
      letter-spacing: 5px;
    }
    .table-sub {
      font-size: 0.65rem;
      margin-top: 4px;
    }
    .seat {
      width: 90px;
    }
    .player-circle {
      width: 48px;
      height: 48px;
    }
    .circle-avatar {
      font-size: 1.2rem;
    }
    .circle-name {
      font-size: 0.58rem;
      padding: 1px 7px;
    }
    .team-badge {
      font-size: 0.5rem;
      padding: 1px 6px;
    }
    .player-circle-wrap {
      gap: 3px;
    }
    .seat-bottom { bottom: -36px; }
    .seat-top { top: -36px; }
    .seat-left { left: -8px; }
    .seat-right { right: -8px; }
    .host-controls {
      margin-top: 44px;
    }
    .start-btn {
      font-size: 0.85rem;
      padding: 10px 28px;
      letter-spacing: 1.5px;
    }
    .waiting-text {
      font-size: 0.8rem;
      letter-spacing: 1px;
    }
  }
</style>
