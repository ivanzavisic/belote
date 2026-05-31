<script>
  import { appState, AVATARS } from '../state.svelte.js';
  import { joinRoom } from '../socket.js';
  import { getLeaderboard, updatePlayerNickname, getPlayerData } from '../firebase.js';
  import CreateRoomDialog from './CreateRoomDialog.svelte';

  let showCreateDialog = $state(false);
  let leaderboard = $state([]);
  let loadingLeaderboard = $state(true);

  let showProfile = $state(false);
  let editNickname = $state('');
  let nickSaving = $state(false);
  let nickSaved = $state(false);
  let nickError = $state('');

  $effect(() => {
    getLeaderboard(10).then(data => {
      leaderboard = data;
      loadingLeaderboard = false;
    }).catch(() => {
      loadingLeaderboard = false;
    });
  });

  function openProfile() {
    editNickname = appState.playerData?.nickname || appState.user?.nickname || '';
    nickSaved = false;
    nickError = '';
    showProfile = true;
  }

  async function saveNickname() {
    const trimmed = editNickname.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 16) {
      nickError = 'Nadimak mora imati 2-16 znakova';
      return;
    }
    if (!appState.firebaseUser) return;
    nickSaving = true;
    nickError = '';
    try {
      await updatePlayerNickname(appState.firebaseUser.uid, trimmed);
      appState.playerData = { ...appState.playerData, nickname: trimmed };
      appState.user.nickname = trimmed;
      localStorage.setItem('belot_nickname', trimmed);
      nickSaved = true;
      setTimeout(() => nickSaved = false, 2000);
    } catch {
      nickError = 'Greška pri spremanju';
    } finally {
      nickSaving = false;
    }
  }

  function handleJoinRoom(roomId) {
    joinRoom(roomId);
    appState.screen = 'room';
  }

  function getAvatar(id) {
    return AVATARS[id] || AVATARS[0];
  }

  function selectAvatar(id) {
    appState.user.avatarId = id;
    localStorage.setItem('belot_avatar', String(id));
  }

  // Abandon toast
  let abandonToast = $state('');
  $effect(() => {
    if (appState.abandonInfo) {
      const info = appState.abandonInfo;
      if (info.result === 'win') {
        abandonToast = `${info.abandonedBy} je napustio igru. Pobjeda!`;
      } else if (info.result === 'teammate') {
        abandonToast = `${info.abandonedBy} je napustio igru.`;
      }
      appState.abandonInfo = null;
      if (abandonToast) {
        setTimeout(() => abandonToast = '', 5000);
      }
    }
  });
</script>

<div class="lobby-screen">
  {#if abandonToast}
    <div class="abandon-toast animate-in">{abandonToast}</div>
  {/if}
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
      <button class="user-info-btn" onclick={openProfile}>
        <span class="user-avatar" style="background: {getAvatar(appState.user.avatarId).bg}">
          {getAvatar(appState.user.avatarId).emoji}
        </span>
        <span class="user-name">{appState.user.nickname}</span>
      </button>
    </div>
  </header>

  <main class="lobby-main">
    <div class="lobby-columns">
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

      <div class="leaderboard-section">
        <div class="leaderboard-panel panel ornate-border">
          <h2 class="leaderboard-title">🏆 Rang Lista</h2>
          {#if loadingLeaderboard}
            <p class="leaderboard-loading">Učitavam...</p>
          {:else if leaderboard.length === 0}
            <p class="leaderboard-empty">Još nema rangiranih igrača</p>
          {:else}
            <div class="lb-header">
              <span class="lb-h-rank">#</span>
              <span class="lb-h-name">Igrač</span>
              <span class="lb-h-score">Bodovi</span>
              <span class="lb-h-wl">W/L</span>
            </div>
            <div class="leaderboard-list">
              {#each leaderboard as player}
                <div class="lb-row" class:lb-gold={player.rank === 1} class:lb-silver={player.rank === 2} class:lb-bronze={player.rank === 3}>
                  <span class="lb-rank">
                    {#if player.rank === 1}🥇{:else if player.rank === 2}🥈{:else if player.rank === 3}🥉{:else}{player.rank}.{/if}
                  </span>
                  <span class="lb-name">{player.nickname}</span>
                  <span class="lb-score">{Math.round(player.score ?? 0)}</span>
                  <span class="lb-stats">
                    <span class="lb-wins">{player.wins}W</span>
                    <span class="lb-losses">{player.losses}L</span>
                  </span>
                </div>
              {/each}
            </div>
          {/if}

          {#if appState.playerData}
            <div class="my-stats">
              <h3>Tvoja statistika</h3>
              <div class="my-stats-row">
                <span>Pobjede: <strong>{appState.playerData.wins}</strong></span>
                <span>Porazi: <strong>{appState.playerData.losses}</strong></span>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </main>

  {#if showCreateDialog}
    <CreateRoomDialog onclose={() => showCreateDialog = false} />
  {/if}

  {#if showProfile}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="profile-overlay" onclick={() => showProfile = false} onkeydown={(e) => e.key === 'Escape' && (showProfile = false)}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="profile-dialog panel ornate-border animate-in" onclick={(e) => e.stopPropagation()}>
        <button class="profile-close" onclick={() => showProfile = false}>✕</button>

        <div class="profile-avatar-big" style="background: {getAvatar(appState.user.avatarId).bg}">
          {getAvatar(appState.user.avatarId).emoji}
        </div>

        <div class="profile-avatar-picker">
          {#each AVATARS as av}
            <button
              class="avatar-option"
              class:avatar-selected={appState.user.avatarId === av.id}
              style="background: {av.bg}"
              onclick={() => selectAvatar(av.id)}
            >
              {av.emoji}
            </button>
          {/each}
        </div>

        <h2 class="profile-name">{appState.playerData?.nickname || appState.user.nickname}</h2>

        {#if appState.isGuest}
          <p class="profile-guest-badge">Gost</p>
        {:else if appState.playerData}
          <div class="profile-stats-grid">
            <div class="profile-stat">
              <span class="profile-stat-value wins">{appState.playerData.wins}</span>
              <span class="profile-stat-label">Pobjede</span>
            </div>
            <div class="profile-stat">
              <span class="profile-stat-value losses">{appState.playerData.losses}</span>
              <span class="profile-stat-label">Porazi</span>
            </div>
            <div class="profile-stat">
              <span class="profile-stat-value abandoned">{appState.playerData.abandoned}</span>
              <span class="profile-stat-label">Napuštene</span>
            </div>
          </div>

          <div class="profile-nickname-edit">
            <label class="profile-label" for="edit-nick">Nadimak</label>
            <div class="profile-nick-row">
              <input
                id="edit-nick"
                class="profile-input"
                type="text"
                maxlength="16"
                bind:value={editNickname}
                onkeydown={(e) => e.key === 'Enter' && saveNickname()}
              />
              <button class="btn btn-small btn-primary" onclick={saveNickname} disabled={nickSaving}>
                {nickSaving ? '...' : 'Spremi'}
              </button>
            </div>
            {#if nickError}
              <p class="profile-nick-error">{nickError}</p>
            {/if}
            {#if nickSaved}
              <p class="profile-nick-saved">✓ Spremljeno!</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .lobby-screen {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(ellipse at 15% 50%, rgba(201,168,76,0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 85% 30%, rgba(220,53,69,0.04) 0%, transparent 50%),
      linear-gradient(180deg, #0a0a0e 0%, #141416 50%, #0a0a0e 100%);
    animation: lobby-bg-shift 12s ease-in-out infinite;
    position: relative;
  }

  .abandon-toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(180deg, #1a2a1a, #0d1a0d);
    border: 1px solid var(--neon-green);
    color: var(--cream);
    padding: 12px 28px;
    z-index: 100;
    font-size: 0.9rem;
    border-radius: 8px;
    box-shadow: 0 0 20px rgba(0,184,148,0.3);
    white-space: nowrap;
  }
  @keyframes lobby-bg-shift {
    0%, 100% { filter: brightness(1) hue-rotate(0deg); }
    50% { filter: brightness(1.04) hue-rotate(3deg); }
  }

  .lobby-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    border-bottom: 1px solid rgba(201,168,76,0.15);
    flex-shrink: 0;
  }

  .lobby-title {
    font-family: var(--font-display);
    font-size: 1.4rem;
    letter-spacing: 6px;
    font-weight: 700;
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

  .user-info-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    background: none;
    border: 2px solid transparent;
    border-radius: 24px;
    padding: 4px 12px 4px 4px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
  }
  .user-info-btn:hover {
    border-color: rgba(201,168,76,0.3);
    background: rgba(201,168,76,0.06);
  }

  .user-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    border: 2px solid rgba(201,168,76,0.3);
  }

  .user-name {
    font-family: var(--font-heading);
    font-weight: 600;
    color: var(--accent-bright);
    letter-spacing: 1px;
  }

  .lobby-main {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  .lobby-columns {
    display: flex;
    gap: 24px;
  }

  .rooms-section {
    flex: 1;
    min-width: 0;
    max-width: 800px;
  }

  .leaderboard-section {
    width: 360px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .section-header h2 {
    font-family: var(--font-heading);
    font-size: 1.3rem;
    color: var(--accent-bright);
    letter-spacing: 2px;
    font-weight: 600;
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
    border-color: var(--accent);
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
    color: var(--text-dim);
  }

  /* ---- LEADERBOARD ---- */
  .leaderboard-panel {
    padding: 20px;
  }
  .leaderboard-title {
    font-family: var(--font-heading);
    font-size: 1.1rem;
    color: var(--accent-bright);
    letter-spacing: 2px;
    text-align: center;
    margin-bottom: 16px;
  }
  .leaderboard-loading,
  .leaderboard-empty {
    text-align: center;
    color: var(--text-dim);
    font-size: 0.85rem;
    padding: 20px 0;
  }
  .leaderboard-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lb-row {
    display: flex;
    align-items: center;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(201,168,76,0.04);
    transition: background 0.2s;
  }
  .lb-row:hover {
    background: rgba(201,168,76,0.08);
  }
  .lb-gold { background: rgba(201,168,76,0.12); }
  .lb-silver { background: rgba(156,163,175,0.1); }
  .lb-bronze { background: rgba(180,120,60,0.1); }
  .lb-header {
    display: flex;
    align-items: center;
    padding: 0 10px 6px;
    border-bottom: 1px solid rgba(201,168,76,0.12);
    margin-bottom: 4px;
  }
  .lb-h-rank { width: 32px; font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; }
  .lb-h-name { flex: 1; font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; }
  .lb-h-score { width: 52px; text-align: right; font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; }
  .lb-h-wl { width: 70px; text-align: right; font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; }
  .lb-rank {
    width: 32px;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--accent);
  }
  .lb-name {
    flex: 1;
    font-family: var(--font-heading);
    font-size: 0.85rem;
    color: var(--cream);
    letter-spacing: 0.5px;
  }
  .lb-score {
    width: 52px;
    text-align: right;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--accent-bright);
  }
  .lb-stats {
    width: 70px;
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    font-size: 0.7rem;
    font-family: var(--font-mono);
  }
  .lb-wins { color: var(--neon-green); }
  .lb-losses { color: var(--neon-red); }

  .my-stats {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid rgba(201,168,76,0.15);
  }
  .my-stats h3 {
    font-family: var(--font-heading);
    font-size: 0.8rem;
    color: var(--accent-bright);
    letter-spacing: 1px;
    margin-bottom: 8px;
    text-transform: uppercase;
  }
  .my-stats-row {
    display: flex;
    justify-content: space-around;
    font-size: 0.85rem;
    color: var(--cream);
  }
  .my-stats-row strong {
    color: var(--accent-bright);
  }

  @media (max-width: 768px) {
    .lobby-columns {
      flex-direction: column;
    }
    .leaderboard-section {
      width: 100%;
    }
    .lobby-header {
      padding: 10px 12px;
      gap: 8px;
    }
    .lobby-title {
      font-size: 1rem;
      letter-spacing: 3px;
    }
    .online-indicator {
      font-size: 0.8rem;
    }
    .lobby-main {
      padding: 12px;
    }
    .lobby-columns {
      gap: 16px;
    }
    .section-header h2 {
      font-size: 1rem;
    }
    .room-card {
      padding: 12px 14px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .room-name {
      font-size: 0.95rem;
    }
    .room-details {
      flex-wrap: wrap;
    }
    .leaderboard-panel {
      padding: 14px;
    }
    .lb-h-wl, .lb-stats {
      display: none;
    }
    .user-name {
      display: none;
    }
  }

  /* ---- PROFILE DIALOG ---- */
  .profile-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    backdrop-filter: blur(4px);
  }
  .profile-dialog {
    width: 380px;
    max-width: 90vw;
    padding: 32px 28px;
    position: relative;
    text-align: center;
  }
  .profile-close {
    position: absolute;
    top: 12px;
    right: 14px;
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 1.2rem;
    cursor: pointer;
    transition: color 0.2s;
  }
  .profile-close:hover {
    color: var(--cream);
  }
  .profile-avatar-big {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.2rem;
    margin: 0 auto 12px;
    border: 3px solid rgba(201,168,76,0.35);
  }
  .profile-avatar-picker {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .avatar-option {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 2px solid transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    cursor: pointer;
    transition: border-color 0.2s, transform 0.15s;
    opacity: 0.6;
  }
  .avatar-option:hover {
    opacity: 0.9;
    transform: scale(1.1);
  }
  .avatar-selected {
    border-color: var(--accent-bright);
    opacity: 1;
    transform: scale(1.15);
    box-shadow: 0 0 10px rgba(201,168,76,0.4);
  }
  .profile-name {
    font-family: var(--font-heading);
    font-size: 1.3rem;
    color: var(--accent-bright);
    letter-spacing: 1.5px;
    margin-bottom: 20px;
  }
  .profile-guest-badge {
    color: var(--text-dim);
    font-size: 0.85rem;
    font-style: italic;
    margin-bottom: 8px;
  }
  .profile-stats-grid {
    display: flex;
    justify-content: center;
    gap: 24px;
    margin-bottom: 24px;
  }
  .profile-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .profile-stat-value {
    font-family: var(--font-heading);
    font-size: 1.6rem;
    font-weight: 700;
  }
  .profile-stat-value.wins { color: var(--neon-green); }
  .profile-stat-value.losses { color: var(--neon-red); }
  .profile-stat-value.abandoned { color: var(--accent); }
  .profile-stat-label {
    font-size: 0.7rem;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .profile-nickname-edit {
    text-align: left;
    border-top: 1px solid rgba(201,168,76,0.12);
    padding-top: 18px;
  }
  .profile-label {
    font-size: 0.75rem;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 6px;
    display: block;
  }
  .profile-nick-row {
    display: flex;
    gap: 8px;
  }
  .profile-input {
    flex: 1;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid rgba(201,168,76,0.2);
    background: rgba(0,0,0,0.3);
    color: var(--cream);
    font-family: var(--font-heading);
    font-size: 0.95rem;
    outline: none;
    transition: border-color 0.2s;
  }
  .profile-input:focus {
    border-color: var(--accent);
  }
  .profile-nick-error {
    color: var(--neon-red);
    font-size: 0.8rem;
    margin-top: 6px;
  }
  .profile-nick-saved {
    color: var(--neon-green);
    font-size: 0.8rem;
    margin-top: 6px;
  }
</style>
