<script>
  import { appState } from './lib/state.svelte.js';
  import Login from './lib/components/Login.svelte';
  import Lobby from './lib/components/Lobby.svelte';
  import Room from './lib/components/Room.svelte';
  import Game from './lib/components/Game.svelte';
</script>

<div class="app-wrapper">
  {#if appState.error}
    <div class="error-toast animate-in">
      {appState.error}
    </div>
  {/if}

  {#if appState.screen === 'login'}
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
</style>
