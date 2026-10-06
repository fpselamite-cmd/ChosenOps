import { useEffect, useState } from 'react';

/** Every so often a star streaks across the sky (unless the member turned it off). */
export function ShootingStars({ enabled }: { enabled: boolean }) {
  const [star, setStar] = useState<{ id: number; top: number; left: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(
        () => {
          const el = document.documentElement.dataset;
          if (el.motion !== 'off' && el.shooting !== 'off' && el.sky !== 'plain' && document.visibilityState === 'visible')
            setStar({ id: Date.now(), top: 5 + Math.random() * 35, left: 45 + Math.random() * 50 });
          next();
        },
        9000 + Math.random() * 14000,
      );
    };
    next();
    return () => clearTimeout(t);
  }, [enabled]);
  if (!star) return null;
  return <span key={star.id} className="shooting-star" style={{ top: `${star.top}vh`, left: `${star.left}vw` }} onAnimationEnd={() => setStar(null)} />;
}
