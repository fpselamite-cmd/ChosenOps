import { Eraser } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * A pad to sign on with a finger or mouse. Reports a small PNG (or '' when empty).
 * Drawn at 2× for sharp lines, then shrunk so the saved image stays small.
 */
export function SignaturePad({ onChange, ink = '#1c1408' }: { onChange: (png: string) => void; ink?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current!;
    const fit = () => {
      const r = c.getBoundingClientRect();
      c.width = Math.round(r.width * 2);
      c.height = Math.round(r.height * 2);
      const g = c.getContext('2d')!;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = ink;
      g.lineWidth = 5;
      setEmpty(true);
      onChange('');
    };
    fit();
    // Resizing clears the pad (only when the width actually changes, e.g. turning a phone).
    let w = c.getBoundingClientRect().width;
    const ro = new ResizeObserver(() => {
      const nw = c.getBoundingClientRect().width;
      if (Math.abs(nw - w) > 1) (w = nw), fit();
    });
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink]);

  const at = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * 2, y: (e.clientY - r.top) * 2 };
  };
  const done = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    // Shrink to at most 480px wide for saving.
    const c = ref.current!;
    const s = Math.min(1, 480 / c.width);
    const out = document.createElement('canvas');
    out.width = Math.round(c.width * s);
    out.height = Math.round(c.height * s);
    out.getContext('2d')!.drawImage(c, 0, 0, out.width, out.height);
    onChange(out.toDataURL('image/png'));
  };

  return (
    <div className="sig-pad">
      <canvas
        ref={ref}
        aria-label="Sign here"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = at(e);
          const g = ref.current!.getContext('2d')!;
          g.beginPath();
          g.arc(last.current.x, last.current.y, 2.5, 0, Math.PI * 2);
          g.fillStyle = ink;
          g.fill();
          setEmpty(false);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const p = at(e);
          const g = ref.current!.getContext('2d')!;
          g.beginPath();
          g.moveTo(last.current.x, last.current.y);
          g.lineTo(p.x, p.y);
          g.stroke();
          last.current = p;
        }}
        onPointerUp={done}
        onPointerCancel={done}
      />
      {empty && <span className="sig-hint">Sign here</span>}
      {!empty && (
        <button
          type="button"
          className="sig-clear"
          onClick={() => {
            const c = ref.current!;
            c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
            setEmpty(true);
            onChange('');
          }}
        >
          <Eraser className="size-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
