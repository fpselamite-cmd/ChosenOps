import { useRef, useState } from 'react';
import { compressImage } from '../lib/image';

/** Button that lets the user pick an image, compresses it, and hands back a data URL. */
export function ImagePicker({
  onPick,
  label = 'Upload image',
  square = true,
  size = 320,
}: {
  onPick: (dataUrl: string) => void;
  label?: string;
  square?: boolean;
  size?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          setError('');
          try {
            onPick(await compressImage(file, size, square));
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <button type="button" className="btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Processing…' : label}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
