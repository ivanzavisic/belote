<script>
  import { appState } from './lib/state.svelte.js';
  import { onAuth, getPlayerData } from './lib/firebase.js';
  import { login } from './lib/socket.js';
  import Login from './lib/components/Login.svelte';
  import Lobby from './lib/components/Lobby.svelte';
  import Room from './lib/components/Room.svelte';
  import Game from './lib/components/Game.svelte';
  import Spinner from './lib/components/Spinner.svelte';

  let authChecked = $state(false);

  $effect(() => {
    const unsub = onAuth(async (user) => {
      if (user) {
        const data = await getPlayerData(user.uid);
        appState.firebaseUser = user;
        appState.playerData = data;
        appState.isGuest = false;
        const nick = data?.nickname || user.displayName || user.email?.split('@')[0] || 'Igrač';
        const avatarId = Number(localStorage.getItem('belot_avatar')) || 0;
        localStorage.setItem('belot_nickname', nick);
        if (appState.screen === 'login') {
          login(nick, avatarId, user.uid);
        }
      }
      authChecked = true;
    });
    return unsub;
  });
</script>

<div class="app-wrapper">
  {#if appState.error}
    <div class="error-toast animate-in">
      {appState.error}
    </div>
  {/if}

  {#if !authChecked}
    <div class="auth-loading">
      <Spinner size={48} />
    </div>
  {:else if appState.screen === 'login'}
    <Login />
  {:else if appState.screen === 'lobby'}
    <Lobby />
  {:else if appState.screen === 'room'}
    <Room />
  {:else if appState.screen === 'game'}
    <Game />
  {/if}
</div>

<style>
  .app-wrapper {
    height: 100vh;
    height: 100dvh;
    width: 100vw;
    overflow: hidden;
    position: relative;
  }

  .error-toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(180deg, #5a0000, #3a0000);
    border: 1px solid var(--neon-red);
    color: var(--cream);
    padding: 12px 28px;
    z-index: 9999;
    font-size: 0.9rem;
    box-shadow: 0 0 20px rgba(255,45,45,0.3);
  }

  .auth-loading {
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0a0a0e;
  }
</style>
