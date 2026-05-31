<script>
  import { appState, AVATARS } from '../state.svelte.js';
  import { login } from '../socket.js';
  import {
    registerWithEmail,
    loginWithEmail,
    loginWithGoogle,
    getPlayerData,
  } from '../firebase.js';

  let mode = $state('choose'); // 'choose', 'login', 'register', 'guest'
  let email = $state('');
  let password = $state('');
  let nickname = $state(localStorage.getItem('belot_nickname') || '');
  let selectedAvatar = $state(Number(localStorage.getItem('belot_avatar')) || 0);
  let shaking = $state(false);
  let errorMsg = $state('');
  let loading = $state(false);

  function shake() {
    shaking = true;
    setTimeout(() => shaking = false, 500);
  }

  async function handleEmailLogin() {
    if (!email.trim() || !password) { shake(); return; }
    loading = true;
    errorMsg = '';
    try {
      const user = await loginWithEmail(email, password);
      const data = await getPlayerData(user.uid);
      appState.firebaseUser = user;
      appState.playerData = data;
      appState.isGuest = false;
      const nick = data?.nickname || user.email.split('@')[0];
      localStorage.setItem('belot_nickname', nick);
      localStorage.setItem('belot_avatar', String(selectedAvatar));
      login(nick, selectedAvatar, user.uid);
    } catch (e) {
      errorMsg = getErrorMessage(e.code);
    } finally {
      loading = false;
    }
  }

  async function handleEmailRegister() {
    if (!email.trim() || !password || !nickname.trim()) { shake(); return; }
    if (nickname.trim().length < 2 || nickname.trim().length > 16) {
      errorMsg = 'Nadimak mora imati 2-16 znakova';
      shake();
      return;
    }
    if (password.length < 6) {
      errorMsg = 'Lozinka mora imati barem 6 znakova';
      shake();
      return;
    }
    loading = true;
    errorMsg = '';
    try {
      const user = await registerWithEmail(email, password, nickname.trim());
      const data = await getPlayerData(user.uid);
      appState.firebaseUser = user;
      appState.playerData = data;
      appState.isGuest = false;
      localStorage.setItem('belot_nickname', nickname.trim());
      localStorage.setItem('belot_avatar', String(selectedAvatar));
      login(nickname.trim(), selectedAvatar, user.uid);
    } catch (e) {
      errorMsg = getErrorMessage(e.code);
    } finally {
      loading = false;
    }
  }

  async function handleGoogleLogin() {
    loading = true;
    errorMsg = '';
    try {
      const user = await loginWithGoogle();
      const data = await getPlayerData(user.uid);
      appState.firebaseUser = user;
      appState.playerData = data;
      appState.isGuest = false;
      const nick = data?.nickname || user.displayName || user.email.split('@')[0];
      localStorage.setItem('belot_nickname', nick);
      localStorage.setItem('belot_avatar', String(selectedAvatar));
      login(nick, selectedAvatar, user.uid);
    } catch (e) {
      console.error('Google login error:', e);
      errorMsg = getErrorMessage(e.code);
    } finally {
      loading = false;
    }
  }

  function handleGuestLogin() {
    if (!nickname.trim()) { shake(); return; }
    if (nickname.trim().length < 2 || nickname.trim().length > 16) { shake(); return; }
    appState.isGuest = true;
    appState.firebaseUser = null;
    appState.playerData = null;
    localStorage.setItem('belot_nickname', nickname.trim());
    localStorage.setItem('belot_avatar', String(selectedAvatar));
    login(nickname.trim(), selectedAvatar, null);
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      if (mode === 'login') handleEmailLogin();
      else if (mode === 'register') handleEmailRegister();
      else if (mode === 'guest') handleGuestLogin();
    }
  }

  function getErrorMessage(code) {
    switch (code) {
      case 'auth/user-not-found': return 'Korisnik ne postoji';
      case 'auth/wrong-password': return 'Pogrešna lozinka';
      case 'auth/invalid-credential': return 'Pogrešan email ili lozinka';
      case 'auth/email-already-in-use': return 'Email je već registriran';
      case 'auth/weak-password': return 'Lozinka je preslaba (min 6 znakova)';
      case 'auth/invalid-email': return 'Neispravan email';
      case 'auth/too-many-requests': return 'Previše pokušaja, pokušaj kasnije';
      case 'auth/popup-closed-by-user': return 'Prijava otkazana';
      default: return 'Greška pri prijavi';
    }
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

    {#if mode === 'choose'}
      <div class="login-form panel ornate-border">
        <h3 class="form-title">Kako želiš igrati?</h3>

        <button class="btn btn-google" onclick={handleGoogleLogin} disabled={loading}>
          <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {loading ? 'Spajanje...' : 'Prijavi se s Google'}
        </button>

        <div class="divider"><span>ili</span></div>

        <div class="auth-buttons">
          <button class="btn btn-primary auth-btn" onclick={() => { mode = 'login'; errorMsg = ''; }}>
            Prijava
          </button>
          <button class="btn auth-btn" onclick={() => { mode = 'register'; errorMsg = ''; }}>
            Registracija
          </button>
        </div>

        <div class="divider"><span>ili</span></div>

        <button class="btn btn-ghost guest-btn" onclick={() => { mode = 'guest'; errorMsg = ''; }}>
          Igraj kao gost
        </button>
        <p class="guest-hint">Gostima se ne prati statistika</p>

        {#if errorMsg}
          <p class="error-msg">{errorMsg}</p>
        {/if}
      </div>

    {:else if mode === 'login'}
      <div class="login-form panel ornate-border">
        <button class="back-link" onclick={() => { mode = 'choose'; errorMsg = ''; }}>← Natrag</button>
        <h3 class="form-title">Prijava</h3>

        <div class="form-group" class:shake={shaking}>
          <label for="email">Email</label>
          <input id="email" class="input" type="email" placeholder="tvoj@email.com" bind:value={email} onkeydown={handleKeydown} />
        </div>

        <div class="form-group">
          <label for="password">Lozinka</label>
          <input id="password" class="input" type="password" placeholder="••••••" bind:value={password} onkeydown={handleKeydown} />
        </div>

        <div class="form-group">
          <label>Odaberi avatar</label>
          <div class="avatar-grid">
            {#each AVATARS as avatar}
              <button class="avatar-option" class:selected={selectedAvatar === avatar.id} onclick={() => selectedAvatar = avatar.id} style="--avatar-bg: {avatar.bg}">
                <span class="avatar-emoji">{avatar.emoji}</span>
              </button>
            {/each}
          </div>
        </div>

        {#if errorMsg}<p class="error-msg">{errorMsg}</p>{/if}

        <button class="btn btn-primary login-btn" onclick={handleEmailLogin} disabled={loading}>
          {loading ? 'Spajanje...' : 'Prijavi se'}
        </button>
      </div>

    {:else if mode === 'register'}
      <div class="login-form panel ornate-border">
        <button class="back-link" onclick={() => { mode = 'choose'; errorMsg = ''; }}>← Natrag</button>
        <h3 class="form-title">Registracija</h3>

        <div class="form-group" class:shake={shaking}>
          <label for="reg-nickname">Nadimak</label>
          <input id="reg-nickname" class="input" type="text" placeholder="Tvoj nadimak..." maxlength="16" bind:value={nickname} onkeydown={handleKeydown} />
          <span class="hint">2-16 znakova</span>
        </div>

        <div class="form-group">
          <label for="reg-email">Email</label>
          <input id="reg-email" class="input" type="email" placeholder="tvoj@email.com" bind:value={email} onkeydown={handleKeydown} />
        </div>

        <div class="form-group">
          <label for="reg-password">Lozinka</label>
          <input id="reg-password" class="input" type="password" placeholder="Min 6 znakova" bind:value={password} onkeydown={handleKeydown} />
        </div>

        <div class="form-group">
          <label>Odaberi avatar</label>
          <div class="avatar-grid">
            {#each AVATARS as avatar}
              <button class="avatar-option" class:selected={selectedAvatar === avatar.id} onclick={() => selectedAvatar = avatar.id} style="--avatar-bg: {avatar.bg}">
                <span class="avatar-emoji">{avatar.emoji}</span>
              </button>
            {/each}
          </div>
        </div>

        {#if errorMsg}<p class="error-msg">{errorMsg}</p>{/if}

        <button class="btn btn-primary login-btn" onclick={handleEmailRegister} disabled={loading}>
          {loading ? 'Registriram...' : 'Registriraj se'}
        </button>
      </div>

    {:else if mode === 'guest'}
      <div class="login-form panel ornate-border">
        <button class="back-link" onclick={() => { mode = 'choose'; errorMsg = ''; }}>← Natrag</button>
        <h3 class="form-title">Igraj kao gost</h3>

        <div class="form-group" class:shake={shaking}>
          <label for="guest-nickname">Nadimak</label>
          <input id="guest-nickname" class="input" type="text" placeholder="Tvoj nadimak..." maxlength="16" bind:value={nickname} onkeydown={handleKeydown} />
          <span class="hint">2-16 znakova</span>
        </div>

        <div class="form-group">
          <label>Odaberi avatar</label>
          <div class="avatar-grid">
            {#each AVATARS as avatar}
              <button class="avatar-option" class:selected={selectedAvatar === avatar.id} onclick={() => selectedAvatar = avatar.id} style="--avatar-bg: {avatar.bg}">
                <span class="avatar-emoji">{avatar.emoji}</span>
                <span class="avatar-label">{avatar.label}</span>
              </button>
            {/each}
          </div>
        </div>

        <button class="btn btn-primary login-btn" onclick={handleGuestLogin}>
          Uđi kao gost
        </button>
        <p class="guest-hint">Statistika se ne prati za goste</p>
      </div>
    {/if}

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

  .form-title {
    font-family: var(--font-heading);
    color: var(--accent-bright);
    text-align: center;
    margin-bottom: 20px;
    font-size: 1.2rem;
    letter-spacing: 2px;
  }

  .form-group {
    margin-bottom: 18px;
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
    margin-top: 8px;
  }

  .btn-google {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px;
    font-size: 0.95rem;
    letter-spacing: 1px;
    background: #fff;
    color: #333;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-family: var(--font-body);
    transition: all 0.2s;
  }
  .btn-google:hover {
    background: #f1f1f1;
    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  }
  .btn-google:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .google-icon { flex-shrink: 0; }

  .divider {
    display: flex;
    align-items: center;
    margin: 18px 0;
    gap: 12px;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(201,168,76,0.2);
  }
  .divider span {
    font-size: 0.75rem;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 2px;
  }

  .auth-buttons {
    display: flex;
    gap: 10px;
  }
  .auth-btn {
    flex: 1;
    padding: 12px;
    font-size: 0.85rem;
    letter-spacing: 1px;
  }

  .btn-ghost {
    width: 100%;
    padding: 12px;
    background: transparent;
    border: 1px solid rgba(201,168,76,0.3);
    color: var(--accent-bright);
    font-family: var(--font-heading);
    font-size: 0.85rem;
    letter-spacing: 2px;
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.2s;
  }
  .btn-ghost:hover {
    background: rgba(201,168,76,0.1);
    border-color: var(--accent);
  }

  .guest-hint {
    text-align: center;
    font-size: 0.7rem;
    color: var(--text-dim);
    margin-top: 8px;
  }

  .back-link {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-family: var(--font-heading);
    font-size: 0.8rem;
    letter-spacing: 1px;
    padding: 0;
    margin-bottom: 12px;
    display: block;
  }
  .back-link:hover { color: var(--accent-bright); }

  .error-msg {
    color: var(--neon-red);
    font-size: 0.8rem;
    text-align: center;
    margin: 10px 0;
    font-weight: 500;
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
