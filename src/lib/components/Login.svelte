<script>
  import { appState, AVATARS } from '../state.svelte.js';
  import { login } from '../socket.js';

  let nickname = $state(localStorage.getItem('belot_nickname') || '');
  let selectedAvatar = $state(Number(localStorage.getItem('belot_avatar')) || 0);
  let shaking = $state(false);

  function handleLogin() {
    if (!nickname.trim()) {
      shaking = true;
      setTimeout(() => shaking = false, 500);
      return;
    }
    if (nickname.trim().length < 2 || nickname.trim().length > 16) {
      shaking = true;
      setTimeout(() => shaking = false, 500);
      return;
    }
    localStorage.setItem('belot_nickname', nickname.trim());
    localStorage.setItem('belot_avatar', String(selectedAvatar));
    login(nickname.trim(), selectedAvatar);
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') handleLogin();
  }
</script>

<div class="login-screen">
  <div class="login-bg"></div>

  <div class="login-content animate-in">
    <div class="logo-section">
      <h1 class="logo neon-text">BELOT</h1>
      <p class="subtitle">Online Kartaška Igra</p>
      <div class="decorative-line"></div>
    </div>

    <div class="login-form panel ornate-border">
      <div class="form-group" class:shake={shaking}>
        <label for="nickname">Unesi nadimak</label>
        <input
          id="nickname"
          class="input"
          type="text"
          placeholder="Tvoj nadimak..."
          maxlength="16"
          bind:value={nickname}
          onkeydown={handleKeydown}
        />
        <span class="hint">2-16 znakova</span>
      </div>

      <div class="form-group">
        <label>Odaberi avatar</label>
        <div class="avatar-grid">
          {#each AVATARS as avatar}
            <button
              class="avatar-option"
              class:selected={selectedAvatar === avatar.id}
              onclick={() => selectedAvatar = avatar.id}
              style="--avatar-bg: {avatar.bg}"
            >
              <span class="avatar-emoji">{avatar.emoji}</span>
              <span class="avatar-label">{avatar.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <button class="btn btn-primary login-btn" onclick={handleLogin}>
        Uđi
      </button>
    </div>

    <p class="footer-text">est. 2026 — Osijek</p>
  </div>
</div>

<style>
  .login-screen {
    height: 100vh;
    width: 100vw;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  .login-bg {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at 20% 30%, rgba(201,168,76,0.15) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 70%, rgba(220,53,69,0.06) 0%, transparent 50%),
      radial-gradient(ellipse at 50% 50%, rgba(201,168,76,0.04) 0%, transparent 70%),
      linear-gradient(180deg, #0a0a0e 0%, #141416 100%);
    animation: bg-breathe 8s ease-in-out infinite;
  }
  @keyframes bg-breathe {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.08); }
  }

  .login-content {
    position: relative;
    z-index: 1;
    text-align: center;
    max-width: 500px;
    width: 100%;
    padding: 20px;
  }

  .logo-section {
    margin-bottom: 32px;
  }

  .logo {
    font-family: var(--font-display);
    font-size: 5rem;
    font-weight: 700;
    letter-spacing: 16px;
    margin-bottom: 8px;
    background: linear-gradient(135deg, var(--accent-bright) 0%, var(--cyan) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 20px rgba(201,168,76,0.3));
  }

  .subtitle {
    font-family: var(--font-heading);
    font-size: 1rem;
    color: var(--text-dim);
    letter-spacing: 5px;
    text-transform: uppercase;
    font-weight: 500;
  }

  .decorative-line {
    width: 200px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    margin: 16px auto 0;
  }

  .login-form {
    padding: 32px;
    text-align: left;
  }

  .form-group {
    margin-bottom: 24px;
  }

  .form-group label {
    display: block;
    font-family: var(--font-heading);
    font-size: 0.8rem;
    color: var(--accent-bright);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 8px;
    font-weight: 600;
  }

  .hint {
    font-size: 0.75rem;
    color: var(--text-dim);
    margin-top: 4px;
    display: block;
  }

  .avatar-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .avatar-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 4px;
    border: 1px solid transparent;
    background: rgba(201,168,76,0.05);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
    color: var(--cream);
  }

  .avatar-option:hover {
    border-color: rgba(201,168,76,0.3);
    background: rgba(201,168,76,0.1);
  }

  .avatar-option.selected {
    border-color: var(--accent);
    background: rgba(201,168,76,0.15);
    box-shadow: 0 0 16px var(--shadow-accent);
  }

  .avatar-emoji {
    font-size: 1.8rem;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--avatar-bg);
  }

  .avatar-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
  }

  .login-btn {
    width: 100%;
    font-size: 1.1rem;
    padding: 16px;
    letter-spacing: 4px;
  }

  .footer-text {
    margin-top: 24px;
    font-family: var(--font-body);
    font-size: 0.75rem;
    color: var(--text-dim);
    letter-spacing: 3px;
  }

  .shake {
    animation: shake 0.5s ease-in-out;
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-8px); }
    40% { transform: translateX(8px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
</style>
