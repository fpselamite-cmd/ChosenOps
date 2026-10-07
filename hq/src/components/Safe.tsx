import { Fingerprint } from 'lucide-react';
import { useState, type ReactNode } from 'react';

/** A locker safe: tap the fingerprint pad, the tumbler spins, the door swings open on what's inside. */
export function Safe({ children, name = 'Private' }: { children: ReactNode; name?: string }) {
  const [stage, setStage] = useState<'shut' | 'scan' | 'open'>('shut');
  return (
    <div className={`safe relative mb-6 ${stage === 'open' ? '' : 'min-h-40'}`}>
      <div className={stage === 'open' ? 'locker-pop' : 'pointer-events-none invisible max-h-40 overflow-hidden'} aria-hidden={stage !== 'open'}>
        {children}
      </div>
      {stage !== 'open' && (
        <div className={`safe-door ${stage === 'scan' ? 'opening' : ''}`} onAnimationEnd={(e) => e.animationName === 'safe-swing' && setStage('open')}>
          <span className="safe-bolts" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="safe-dial" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} style={{ rotate: `${i * 30}deg` }} />
            ))}
            <b />
          </span>
          <span className="safe-plate" aria-hidden>
            <b>{name}</b>
            <small>Chosen Safe Co. · Est. in blood</small>
          </span>
          <button className="safe-print" onClick={() => setStage('scan')} disabled={stage !== 'shut'} aria-label="Open your safe">
            <Fingerprint className="size-7" />
            <span className="safe-scan" />
          </button>
          <span className="safe-hint label">{stage === 'shut' ? 'Touch to open your safe' : 'Unlocking…'}</span>
        </div>
      )}
    </div>
  );
}
