<script>
  // Reusable acorn (žir) spinner with a "compass needle / magnet" motion:
  // it swings sideways, overshoots and stabilizes, then snaps quickly to
  // vertical, stabilizes, and repeats toward the other side.
  let { size = 40 } = $props();
</script>

<span class="acorn-spinner" style="--acorn-size: {size}px;" role="status" aria-label="Učitavanje">
  <img src="/suit-icons/acorn-icon@medium.png" alt="" class="acorn-img" draggable="false" />
</span>

<style>
  .acorn-spinner {
    display: inline-block;
    width: var(--acorn-size);
    height: var(--acorn-size);
    line-height: 0;
  }

  .acorn-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transform-origin: 50% 50%;
    animation: acorn-magnet 3.6s ease-in-out infinite;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45));
    will-change: transform;
  }

  @keyframes acorn-magnet {
    /* stabilized vertical */
    0%   { transform: rotate(0deg); }
    6%   { transform: rotate(0deg); }

    /* swing sideways, overshoot, then settle */
    16%  { transform: rotate(96deg); }
    20%  { transform: rotate(84deg); }
    23%  { transform: rotate(90deg); }

    /* stabilized sideways */
    36%  { transform: rotate(90deg); }

    /* fast snap back to vertical, overshoot, then settle */
    44%  { transform: rotate(-8deg); }
    48%  { transform: rotate(4deg); }
    51%  { transform: rotate(0deg); }

    /* stabilized vertical */
    62%  { transform: rotate(0deg); }

    /* swing to the other side, overshoot, then settle */
    72%  { transform: rotate(-96deg); }
    76%  { transform: rotate(-84deg); }
    79%  { transform: rotate(-90deg); }

    /* stabilized sideways */
    90%  { transform: rotate(-90deg); }

    /* fast snap back to vertical, overshoot, then settle */
    96%  { transform: rotate(8deg); }
    98%  { transform: rotate(-4deg); }
    100% { transform: rotate(0deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .acorn-img {
      animation-duration: 7s;
    }
  }
</style>
