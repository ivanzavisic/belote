<script>
  let { card, playable = false, faceDown = false, small = false, medium = false, onclick = null } = $props();

  function cardImage(c) {
    if (!c) return '/cards/back.png';
    return `/cards/${c.suit}-${c.value}.png`;
  }
</script>

{#if faceDown}
  <div class="card card-back" class:small class:medium>
    <img src="/cards/back.png" alt="Karta" draggable="false" />
  </div>
{:else if card}
  <button
    class="card"
    class:playable
    class:small
    class:medium
    class:not-playable={!playable && onclick}
    onclick={() => playable && onclick ? onclick() : null}
    disabled={!playable}
  >
    <img src={cardImage(card)} alt="{card.suit} {card.value}" draggable="false" />
  </button>
{/if}

<style>
  .card {
    width: 90px;
    height: 145px;
    border: none;
    padding: 0;
    background: none;
    cursor: default;
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
    filter: contrast(1.1) saturate(1.25) brightness(0.92) sepia(0.06);
  }

  .card.playable {
    cursor: pointer;
  }

  .card.playable:hover {
    transform: translateY(-12px);
    z-index: 10;
  }

  .card.playable:hover img {
    box-shadow:
      0 4px 16px rgba(0,0,0,0.6),
      0 0 15px rgba(255,215,0,0.4);
  }

  .card.not-playable {
    filter: brightness(0.5);
    cursor: not-allowed;
  }

  .card.small {
    width: 50px;
    height: 80px;
  }

  .card.medium {
    width: 75px;
    height: 121px;
  }

  .card-back {
    width: 90px;
    height: 145px;
  }

  .card-back.small {
    width: 36px;
    height: 58px;
  }

  .card-back.medium {
    width: 75px;
    height: 121px;
  }

  .card-back img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
  }
</style>
