import { HandHeart, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Panel } from '../../components/Page';
import { useCollection, useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { seePatch, type Graduation, type Onboarding } from '../../lib/welcome';
import { stopsOf } from './Road';
import { useAssociate, useWelcomeAccess } from './useWelcome';

const CONFETTI = ['#f8e7a8', '#d4af37', '#b8962e', '#fff7d6', '#94741f'];

/** The first time someone logs in after being patched in. */
export function PatchMoment() {
  const { me, myRank, settings } = useHub();
  const ob = useDoc<Onboarding>(`onboarding/${me.id}`);
  if (!ob?.graduatedAt || ob.patchSeen) return null;
  return (
    <div className="patch-moment" role="dialog" aria-label="Welcome to the family">
      {Array.from({ length: 70 }, (_, i) => (
        <span key={i} className="confetti" style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 14) * 0.12}s` }} />
      ))}
      <div className="px-6 text-center">
        <div className="patch-seal">
          <span className="font-hud text-xs font-bold tracking-[0.3em] uppercase">{settings.name}</span>
          <b className="font-display text-3xl">Patched in</b>
          <span className="mt-1 font-hud text-sm font-bold tracking-widest uppercase">{myRank?.name}</span>
        </div>
        <p className="mt-8 font-display text-3xl text-gold-100">Welcome to the family, {me.name}.</p>
        <p className="mt-2 text-gold-300/80 italic">{settings.motto}</p>
        <button className="btn-gold mt-8" onClick={() => seePatch(me.id)}>
          Take my place
        </button>
      </div>
    </div>
  );
}

/** Everyone sees who got patched in this week. */
export function NewlyPatched() {
  const grads = (useCollection<Graduation>('graduations') ?? []).filter((g) => Date.now() - (g.at?.toMillis() ?? Date.now()) < 7 * 86400e3);
  if (!grads.length) return null;
  return (
    <div className="hud mb-6 flex flex-wrap items-center gap-3 border-gold-400/60 p-4">
      <Sparkles className="size-5 text-gold-300" />
      <p className="flex-1 text-gold-100">
        Welcome {grads.map((g) => g.name).join(', ').replace(/, ([^,]*)$/, ' and $1')} to the family
        <span className="text-smoke"> · patched in as {[...new Set(grads.map((g) => g.rankName))].join(' / ')}</span>
      </p>
    </div>
  );
}

/** An associate's progress, on their Dashboard. */
export function MyProgress() {
  const { me } = useHub();
  const { isAssoc } = useWelcomeAccess();
  if (!isAssoc) return null;
  return <MyProgressCard id={me.id} />;
}
function MyProgressCard({ id }: { id: string }) {
  const { w, ob, p } = useAssociate(id);
  const now = stopsOf(w, p, ob, id).find((s) => s.state !== 'done');
  return (
    <Panel title="Your road to the family" right={<Link to="/welcome" className="label hover:text-gold-300">Open →</Link>}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-ash">
          {p.done} of {p.total} done
        </span>
        <b className="font-hud text-xl text-gold-200">{p.pct}%</b>
      </div>
      <div className="welcome-bar mt-1.5">
        <i style={{ width: `${p.pct}%` }} />
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-gold-100">
        <HandHeart className="size-4 text-gold-400" /> {now ? `Next: ${now.label} · ${now.sub}` : 'Up for your patch. High Table decides.'}
      </p>
    </Panel>
  );
}
