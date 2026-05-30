<script>
  let { card, playable = false, faceDown = false, small = false, medium = false, onclick = null } = $props();

  function cardImage(c) {
    if (!c) return '/cards/back.png';
    return `/cards/${c.suit}-${c.value}.png`;
  }
</script>

{#if faceDown}
  <div class="card card-back" class:small class:medium>
    <div class="back-face">
      <div class="back-logo">B</div>
    </div>
  </div>
{:else if card}
  <button
    class="card"
    class:small
    class:medium
    onclick={() => onclick ? onclick() : null}
  >
    <img src={cardImage(card)} alt="{card.suit} {card.value}" draggable="false" />
  </button>
{/if}

<style>
  .card {
    width: 132px;
    height: 214px;
    border: none;
    padding: 0;
    background: none;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s, filter 0.2s;
    position: relative;
    flex-shrink: 0;
  }

  .card img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    filter: brightness(0.76) contrast(2) saturate(1.2);
  }

  .card:hover {
    transform: translateY(-12px);
    z-index: 10;
  }

  .card:hover img {
    box-shadow:
      0 4px 16px rgba(0,0,0,0.6),
      0 0 15px rgba(201,168,76,0.4);
  }

  .card.small {
    width: 40px;
    height: 65px;
  }

  .card.medium {
    width: 94px;
    height: 150px;
  }

  .card-back {
    width: 132px;
    height: 214px;
  }

  .card-back.small {
    width: 29px;
    height: 47px;
  }

  .card-back.medium {
    width: 94px;
    height: 150px;
  }

  .card-back img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    display: none;
  }

  /* ---- MODERN CARD BACK ---- */
  .back-face {
    width: 100%;
    height: 100%;
    border-radius: 6px;
    background: linear-gradient(135deg, #0d0d12 0%, #1a1a22 40%, #0d0d12 100%);
    border: 1.5px solid rgba(201,168,76,0.5);
    box-shadow:
      0 2px 10px rgba(0,0,0,0.5),
      inset 0 0 20px rgba(201,168,76,0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .back-face::before {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 4px;
    border: 1px solid rgba(201,168,76,0.15);
    pointer-events: none;
  }
  .back-face::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      repeating-linear-gradient(
        45deg,
        transparent,
        transparent 8px,
        rgba(201,168,76,0.03) 8px,
        rgba(201,168,76,0.03) 9px
      );
    pointer-events: none;
  }
  .back-logo {
    font-family: "Space Grotesk", sans-serif;
    font-weight: 700;
    font-size: 1.1rem;
    color: rgba(232,212,139,0.35);
    text-shadow: 0 0 12px rgba(201,168,76,0.2);
    z-index: 1;
    letter-spacing: 2px;
  }
  .card-back.small .back-face {
    border-radius: 3px;
    border-width: 1px;
  }
  .card-back.small .back-face::before {
    inset: 2px;
    border-radius: 2px;
  }
  .card-back.small .back-logo {
    font-size: 0.4rem;
    letter-spacing: 1px;
  }
</style>
