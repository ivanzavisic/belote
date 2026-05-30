<script>
  import { appState, AVATARS } from '../state.svelte.js';
  import { joinRoom } from '../socket.js';
  import CreateRoomDialog from './CreateRoomDialog.svelte';

  let showCreateDialog = $state(false);

  function handleJoinRoom(roomId) {
    joinRoom(roomId);
    appState.screen = 'room';
  }

  function getAvatar(id) {
    return AVATARS[id] || AVATARS[0];
  }
</script>

<div class="lobby-screen">
  <header class="lobby-header panel">
    <div class="header-left">
      <h1 class="lobby-title neon-text">BELOT</h1>
    </div>
    <div class="header-center">
      <div class="online-indicator">
        <span class="online-dot"></span>
        <span>Online: <strong>{appState.onlineCount}</strong></span>
      </div>
    </div>
    <div class="header-right">
      <div class="user-info">
        <span class="user-avatar" style="background: {getAvatar(appState.user.avatarId).bg}">
          {getAvatar(appState.user.avatarId).emoji}
        </span>
        <span class="user-name">{appState.user.nickname}</span>
      </div>
    </div>
  </header>

  <main class="lobby-main">
    <div class="rooms-section">
      <div class="section-header">
        <h2>Otvorene Sobe</h2>
        <button class="btn btn-primary" onclick={() => showCreateDialog = true}>
          + Kreiraj Sobu
        </button>
      </div>

      <div class="rooms-list">
        {#if appState.rooms.length === 0}
          <div class="empty-state">
            <p class="empty-icon">🃏</p>
            <p>Nema otvorenih soba</p>
            <p class="empty-hint">Kreiraj prvu sobu i pozovi prijatelje!</p>
          </div>
        {:else}
          {#each appState.rooms as room}
            <div class="room-card panel animate-in">
              <div class="room-info">
                <h3 class="room-name">{room.name}</h3>
                <div class="room-details">
                  <span class="badge badge-gold">Do {room.settings.targetScore}</span>
                  <span class="badge" class:badge-green={room.playerCount < 4} class:badge-red={room.playerCount >= 4}>
                    {room.playerCount}/4
                  </span>
                </div>
                <div class="room-host">
                  Domaćin: {room.hostName}
                </div>
              </div>
              <button
                class="btn btn-small"
                disabled={room.playerCount >= 4 || room.inGame}
                onclick={() => handleJoinRoom(room.id)}
              >
                {room.inGame ? 'U igri' : room.playerCount >= 4 ? 'Puno' : 'Pridruži se'}
              </button>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </main>

  {#if showCreateDialog}
    <CreateRoomDialog onclose={() => showCreateDialog = false} />
  {/if}
</div>

<style>
  .lobby-screen {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(ellipse at 20% 50%, rgba(140,90,30,0.1) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 50%, rgba(140,90,30,0.06) 0%, transparent 50%),
      var(--bg-darkest);
  }

  .lobby-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    border-bottom: 2px solid var(--gold-dark);
    flex-shrink: 0;
  }

  .lobby-title {
    font-family: var(--font-display);
    font-size: 1.6rem;
    letter-spacing: 6px;
  }

  .online-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--cream);
    font-size: 0.95rem;
  }

  .online-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--neon-green);
    box-shadow: 0 0 8px var(--neon-green);
    animation: pulse 2s infinite;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .user-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    border: 2px solid var(--gold-dark);
  }

  .user-name {
    font-family: var(--font-heading);
    font-weight: 700;
    color: var(--gold);
    letter-spacing: 1px;
  }

  .lobby-main {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  .rooms-section {
    max-width: 800px;
    margin: 0 auto;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .section-header h2 {
    font-family: var(--font-heading);
    font-size: 1.4rem;
    color: var(--gold);
    letter-spacing: 2px;
  }

  .rooms-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .room-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    transition: border-color 0.2s;
  }

  .room-card:hover {
    border-color: var(--gold);
  }

  .room-name {
    font-family: var(--font-heading);
    font-size: 1.1rem;
    color: var(--cream);
    margin-bottom: 6px;
  }

  .room-details {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
  }

  .room-host {
    font-size: 0.8rem;
    color: var(--text-dim);
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-dim);
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 12px;
  }

  .empty-hint {
    font-size: 0.85rem;
    margin-top: 8px;
    color: var(--gold-dark);
  }
</style>
