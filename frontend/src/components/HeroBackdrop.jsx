import { useEffect, useState } from "react";

// Rotating DNA / genomics imagery shown semi-transparent behind page heroes.
const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1643780668909-580822430155?q=80&w=1600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1681911046064-e663d5192921?q=80&w=1600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1581594549595-35f6edc7b762?q=80&w=1600&auto=format&fit=crop",
];

const INTERVAL_MS = 6000;

export default function HeroBackdrop() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setIdx(i => (i + 1) % HERO_IMAGES.length), INTERVAL_MS);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="hb-root" aria-hidden="true">
      {HERO_IMAGES.map((url, i) => (
        <div key={url} className={`hb-slide ${i === idx ? "active" : ""}`}
          style={{ backgroundImage: `url(${url})` }} />
      ))}
      <div className="hb-overlay" />
    </div>
  );
}
