import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-smoke">{hint}</span>}
    </label>
  );
}

export function ErrorText({ error }: { error?: string | null }) {
  if (!error) return null;
  return <p className="border-l-2 border-danger bg-danger/10 px-3 py-2 text-sm text-red-300">{error}</p>;
}

/** The Chosen seal, large and slowly turning, with a soft glow. */
export function Loading({ label = 'Loading…', children }: { label?: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-6 px-4">
      <div className="relative">
        <div className="absolute inset-0 -m-10 rounded-full bg-[radial-gradient(circle,rgb(var(--acc)/0.22),transparent_65%)] blur-xl" />
        <img
          src="/brand/logo.webp"
          alt=""
          className="relative size-[min(68vw,340px)] animate-[seal-spin_40s_linear_infinite] rounded-full drop-shadow-[0_0_28px_rgb(var(--acc)/0.35)]"
        />
      </div>
      <p className="label flex items-center gap-2 text-[12px]">
        <Loader2 className="size-3.5 animate-spin" /> {label}
      </p>
      {children}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="text-gold-500">{icon}</div>}
      <p className="font-hud text-lg font-bold tracking-wide text-gold-200">{title}</p>
      {children && <div className="max-w-md text-sm text-smoke">{children}</div>}
    </div>
  );
}
