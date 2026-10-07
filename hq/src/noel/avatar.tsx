import { useHub } from '../hooks/useHub';
import { initials } from '../lib/format';

/** A person's picture (or initials) in NoelOps' round avatar style. */
export function NoelAvatar({ name }: { name: string }) {
  const { roster } = useHub();
  if (name === 'ChosenOps')
    return (
      <span className="dx-av" style={{ background: 'hsl(var(--acc-h) 80% 10%)', color: 'hsl(var(--acc-h) 69% 58%)', borderColor: 'hsl(var(--acc-h) 64% 24%)' }} title="ChosenOps">
        <i className="fa-solid fa-cannabis" />
      </span>
    );
  const m = roster.find((x) => x.name === name);
  if (m?.avatar) return <img className="dx-av" src={m.avatar} alt={name} title={name} />;
  return (
    <span className="dx-av" style={{ background: 'linear-gradient(135deg,#6e5516,#2a2009)', color: '#f8e7a8' }} title={name}>
      {initials(name)}
    </span>
  );
}

export function relTime(ms: number | undefined, now: number) {
  if (!ms) return 'just now';
  const secs = Math.max(0, Math.floor((now - ms) / 1000));
  if (secs < 45) return 'just now';
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`;
  return new Date(ms).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
}
