/** Gold divider with a small star at its centre, echoing the seal's linework. */
export function Ornament({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 text-gold-500 ${className}`} aria-hidden>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-700/80" />
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
        <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" />
      </svg>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-700/80" />
    </div>
  );
}

/** Small gold section heading used across lore pages. */
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 fill-gold-400" aria-hidden>
        <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" />
      </svg>
      <h2 className="panel-title flex-1">{children}</h2>
      {action}
    </div>
  );
}
