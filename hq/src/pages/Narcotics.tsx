import '@fortawesome/fontawesome-free/css/all.min.css';
import '../noel/noel.css';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useHub } from '../hooks/useHub';
import type { OpsLocation } from '../noel/data';
import { cookState } from '../noel/grow';
import { Coke, Meth } from '../noel/MethCoke';
import { useOps } from '../noel/ops';
import { Overview } from '../noel/Overview';
import { NarcoticsProvider, useNarcotics } from '../noel/store';
import { TimerBar, type NarcTab } from '../noel/TimerBar';
import { ToastProvider, useChartTips, useHolo } from '../noel/ui';
import { HarvestModal, Weed } from '../noel/Weed';

const TABS: { id: NarcTab; label: string; icon: string; sub: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'fa-gauge-high', sub: 'Everything on hand, what can still be made, and what’s coming in.' },
  { id: 'weed', label: 'Weed', icon: 'fa-cannabis', sub: 'Grow timers, stock in every stash house and the pot plans.' },
  { id: 'meth', label: 'Meth', icon: 'fa-flask', sub: 'The cook, start to finish: what to grab, what to do and the rules in the lab.' },
  { id: 'coke', label: 'Coke', icon: 'fa-snowflake', sub: 'Coca leaves to bricks: what to bring, the steps at the warehouse and the rules on the island.' },
];

function Body() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'overview') as NarcTab;
  const setTab = (t: NarcTab) => {
    setParams(t === 'overview' ? {} : { tab: t });
    window.scrollTo({ top: 0 });
  };
  const ops = useOps('narcotics');
  const { ready, cooks, now, crewFilter, setCrewFilter } = useNarcotics();
  const { myCrews } = useHub();
  const [harvesting, setHarvesting] = useState<OpsLocation[] | null>(null);
  useHolo();
  useChartTips();
  const info = TABS.find((t) => t.id === tab)!;
  const methReady = cooks.filter((c) => cookState(c, now).ready).length;

  if (!ready)
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-weed-400">
        <i className="fa-solid fa-cannabis fa-spin text-3xl" />
      </div>
    );

  return (
    <>
      <TimerBar ops={ops} onHarvest={(l) => setHarvesting([l])} setTab={setTab} />
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="dx-title text-2xl font-black text-white">
            <i className={`fa-solid ${info.icon} mr-2 ${tab === 'meth' ? 'text-cyan-300' : tab === 'coke' ? 'text-sky-300' : 'text-weed-400'}`} />
            {tab === 'overview' ? 'Narcotics' : info.label}
          </h1>
          <p className="mt-1 text-xs text-slate-400">{info.sub}</p>
        </div>
        {myCrews.length > 0 && (
          <div className="dx-seg" role="group" aria-label="Which places">
            <button type="button" className={crewFilter === 'all' ? 'on' : ''} onClick={() => setCrewFilter('all')}>
              All crews
            </button>
            <button type="button" className={crewFilter === 'mine' ? 'on' : ''} onClick={() => setCrewFilter('mine')} title="Gang-wide places plus the ones your crews run">
              My crews
            </button>
          </div>
        )}
      </div>
      <div className="dx-tabs mb-6">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`dx-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            <i className={`fa-solid ${t.icon}`} />
            {t.label}
            {t.id === 'meth' && methReady > 0 && <span className="count">{methReady} ready</span>}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview setTab={setTab} />}
      {tab === 'weed' && <Weed ops={ops} onHarvest={(locs) => locs.length && setHarvesting(locs)} />}
      {tab === 'meth' && <Meth ops={ops} />}
      {tab === 'coke' && <Coke ops={ops} />}
      {harvesting && <HarvestModal queue={harvesting} ops={ops} onClose={() => setHarvesting(null)} />}
    </>
  );
}

/** NoelOps, rebuilt inside ChosenOps: one page with Overview · Weed · Meth · Coke. */
export default function Narcotics() {
  return (
    <NarcoticsProvider>
      <ToastProvider>
        <Body />
      </ToastProvider>
    </NarcoticsProvider>
  );
}
