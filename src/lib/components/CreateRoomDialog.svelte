<script>
  import { createRoom } from '../socket.js';
  import { appState } from '../state.svelte.js';

  let { onclose } = $props();

  let roomName = $state(`Soba od ${appState.user.nickname}`);
  let targetScore = $state(1001);
  let prolaz = $state(true);

  function handleCreate() {
    if (!roomName.trim()) return;
    createRoom(roomName.trim(), { targetScore, prolaz });
    appState.screen = 'room';
    onclose();
  }
</script>

<div class="modal-overlay" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="modal animate-in">
    <h2>🃏 Kreiraj Sobu</h2>

    <div class="form-group">
      <label>Naziv sobe</label>
      <input
        class="input"
        type="text"
        maxlength="30"
        bind:value={roomName}
      />
    </div>

    <div class="form-group">
      <label>Igraj do</label>
      <div class="radio-group">
        <label class="radio-option" class:active={targetScore === 501}>
          <input type="radio" bind:group={targetScore} value={501} />
          <span>501</span>
        </label>
        <label class="radio-option" class:active={targetScore === 701}>
          <input type="radio" bind:group={targetScore} value={701} />
          <span>701</span>
        </label>
        <label class="radio-option" class:active={targetScore === 1001}>
          <input type="radio" bind:group={targetScore} value={1001} />
          <span>1001</span>
        </label>
      </div>
    </div>

    <div class="form-group">
      <label>Tip igre</label>
      <div class="radio-group">
        <label class="radio-option" class:active={prolaz === true}>
          <input type="radio" bind:group={prolaz} value={true} />
          <span>Na prolaz</span>
        </label>
        <label class="radio-option" class:active={prolaz === false}>
          <input type="radio" bind:group={prolaz} value={false} />
          <span>Na dosta</span>
        </label>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn" onclick={onclose}>Odustani</button>
      <button class="btn btn-primary" onclick={handleCreate}>Kreiraj</button>
    </div>
  </div>
</div>

<style>
  .form-group {
    margin-bottom: 20px;
  }

  .form-group > label:first-child {
    display: block;
    font-family: var(--font-heading);
    font-size: 0.85rem;
    color: var(--gold);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 8px;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 28px;
  }
</style>
