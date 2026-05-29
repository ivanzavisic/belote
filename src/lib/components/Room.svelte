<script>
  import { appState, AVATARS } from '../state.svelte.js';
  import { leaveRoom, addBot, removePlayer, startGame } from '../socket.js';

  let room = $derived(appState.currentRoom);
  let isHost = $derived(room && room.hostId === appState.user.id);
  let playerCount = $derived(room ? room.players.length : 0);
  let canStart = $derived(playerCount === 4);

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
            <div class="seat {posClass}" class:occupied={player} class:team-a={seatIndex % 2 === 0} class:team-b={seatIndex % 2 !== 0}>
              {#if player}
                <div class="player-card">
                  <span class="player-avatar" style="background: {getAvatar(player.avatarId).bg}">
                    {player.isBot ? '🤖' : getAvatar(player.avatarId).emoji}
                  </span>
                  <span class="player-name" class:is-bot={player.isBot}>
                    {player.nickname}
                  </span>
                  <span class="team-badge">Tim {getTeamLabel(seatIndex)}</span>
                  {#if isHost && player.isBot}
                    <button class="remove-btn" onclick={() => removePlayer(seatIndex)} title="Ukloni">✕</button>
                  {/if}
                </div>
              {:else}
                <div class="empty-seat">
                  <span class="seat-label">{seatLabels[seatIndex]}</span>
                  <span class="seat-empty">Prazno</span>
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
      radial-gradient(ellipse at center, rgba(13,74,13,0.2) 0%, transparent 70%),
      var(--bg-darkest);
  }

  .room-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    border-bottom: 2px solid var(--gold-dark);
    flex-shrink: 0;
  }

  .room-title-section {
    text-align: center;
  }

  .room-name {
    font-family: var(--font-heading);
    font-size: 1.2rem;
    color: var(--gold);
    letter-spacing: 2px;
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
  }

  .seat-bottom { bottom: -30px; left: 50%; transform: translateX(-50%); }
  .seat-top { top: -30px; left: 50%; transform: translateX(-50%); }
  .seat-left { left: -40px; top: 50%; transform: translateY(-50%); }
  .seat-right { right: -40px; top: 50%; transform: translateY(-50%); }

  .player-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px;
    background: rgba(0,0,0,0.7);
    border: 1px solid var(--gold-dark);
    position: relative;
  }

  .player-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    border: 2px solid var(--gold-dark);
  }

  .player-name {
    font-family: var(--font-heading);
    font-size: 0.8rem;
    color: var(--cream);
    font-weight: 700;
  }

  .player-name.is-bot {
    color: var(--text-dim);
  }

  .team-badge {
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: 2px;
    font-weight: 700;
    letter-spacing: 1px;
  }

  .team-a .team-badge {
    background: rgba(255,45,45,0.3);
    color: var(--neon-red);
    border: 1px solid var(--neon-red);
  }

  .team-b .team-badge {
    background: rgba(57,255,20,0.2);
    color: var(--neon-green);
    border: 1px solid var(--neon-green);
  }

  .remove-btn {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,0,0,0.3);
    border: 1px solid var(--neon-red);
    color: var(--neon-red);
    cursor: pointer;
    font-size: 0.7rem;
  }

  .remove-btn:hover {
    background: rgba(255,0,0,0.5);
  }

  .empty-seat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px;
    background: rgba(0,0,0,0.5);
    border: 2px solid rgba(255,215,0,0.3);
    animation: waiting-pulse 2s ease-in-out infinite;
  }

  @keyframes waiting-pulse {
    0%, 100% {
      border-color: rgba(255,215,0,0.2);
      box-shadow: 0 0 0 0 rgba(255,215,0,0);
    }
    50% {
      border-color: rgba(255,215,0,0.6);
      box-shadow: 0 0 12px 2px rgba(255,215,0,0.15);
    }
  }

  .seat-label {
    font-size: 0.7rem;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .seat-empty {
    font-size: 0.8rem;
    color: var(--gold-dark);
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
    color: var(--gold);
    font-family: var(--font-heading);
    letter-spacing: 2px;
  }
</style>
