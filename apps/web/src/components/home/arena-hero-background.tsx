const ARENA_HERO_BACKGROUND_CSS = `
.home-arena-bg {
  position: absolute;
  inset: -4rem 0 0;
  overflow: hidden;
  perspective: 1100px;
  perspective-origin: 50% 0%;
}

.home-arena-bg-plane {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: min(2200px, 170vw);
  aspect-ratio: 1;
  transform: translateX(-50%) rotateX(62deg);
  transform-origin: 50% 100%;
  --sq: color-mix(in oklab, var(--chess-board-dark) 13%, transparent);
  background-image: conic-gradient(
    from 90deg at 50% 50%,
    var(--sq) 0 25%,
    transparent 0 50%,
    var(--sq) 0 75%,
    transparent 0
  );
  background-size: calc(100% / 4) calc(100% / 4);
  -webkit-mask-image: linear-gradient(to top, black 30%, transparent 82%);
  mask-image: linear-gradient(to top, black 30%, transparent 82%);
  animation: home-arena-bg-in 700ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

.dark .home-arena-bg-plane {
  --sq: color-mix(in oklab, var(--chess-board-light) 9%, transparent);
}

@keyframes home-arena-bg-in {
  from {
    opacity: 0;
    transform: translateX(-50%) rotateX(62deg) translateY(90px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-arena-bg-plane {
    animation: none;
  }
}
`;

export default function ArenaHeroBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 select-none"
    >
      <style>{ARENA_HERO_BACKGROUND_CSS}</style>
      <div className="home-arena-bg">
        <div className="home-arena-bg-plane" />
      </div>
    </div>
  );
}
