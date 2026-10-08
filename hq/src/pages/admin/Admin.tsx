import { ArrowRight, Eye, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '../../components/Page';
import { useHub } from '../../hooks/useHub';
import { LowStockLine } from '../Stash';
import AccessTab from './AccessTab';
import ActivityTab from './ActivityTab';
import GunModelsTab from './GunModelsTab';
import IntegrationsTab from './IntegrationsTab';
import ListsTab from './ListsTab';
import MembersTab from './MembersTab';
import PendingTab from './PendingTab';
import RanksTab from './RanksTab';
import RolesTab from './RolesTab';
import SettingsTab from './SettingsTab';
import { useAttention } from './useAttention';

type Tab = 'pending' | 'members' | 'roles' | 'lists' | 'activity' | 'settings' | 'integrations' | 'ranks' | 'access' | 'guns';

/** The control room: what needs attention up top, then the tools. */
export default function Admin() {
  const { can, members, isOwner, isAdmin, isLead } = useHub();
  const [params, setParams] = useSearchParams();
  const pending = members.filter((m) => m.status === 'pending').length;

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'pending', label: `Waiting${pending ? ` · ${pending}` : ''}`, show: can('approveMembers') },
    { id: 'members', label: 'Members', show: isAdmin || can('resetPins') || can('manageMembers') },
    { id: 'roles', label: 'Roles', show: isLead || can('manageRanks') },
    { id: 'lists', label: 'Lists & prices', show: isAdmin || can('manageOps') },
    { id: 'guns', label: 'Gun models', show: isLead },
    { id: 'activity', label: 'Activity', show: isAdmin },
    { id: 'settings', label: 'Gang settings', show: can('manageSettings') },
    { id: 'integrations', label: 'NoelOps', show: can('manageSettings') },
    { id: 'ranks', label: 'Ranks & permissions', show: can('manageRanks') },
    { id: 'access', label: 'Admin access', show: isOwner },
  ];
  const visible = tabs.filter((t) => t.show);
  if (!visible.length) return <Navigate to="/" replace />;
  const tab = visible.find((t) => t.id === params.get('tab'))?.id ?? visible[0]!.id;

  return (
    <>
      <PageHeader icon={ShieldCheck} kicker="Command" title="Admin" sub="Upkeep, big changes and options. Rank powers act on people below you; admin powers are out-of-character." />
      <ControlRoom />
      <div className="mb-6">
        <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={visible} />
      </div>
      {tab === 'pending' && <PendingTab />}
      {tab === 'members' && <MembersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'lists' && <ListsTab />}
      {tab === 'guns' && <GunModelsTab />}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'integrations' && <IntegrationsTab />}
      {tab === 'ranks' && <RanksTab />}
      {tab === 'access' && <AccessTab />}
    </>
  );
}

function ControlRoom() {
  const { isLead, isAdmin } = useHub();
  const items = useAttention();
  const live = items.filter((i) => i.n > 0);
  const total = live.reduce((t, i) => t + i.n, 0);
  return (
    <section className="control-room hud mb-6 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className={`status-light ${total ? 'warn' : 'ok'}`} aria-hidden />
        <p className="font-hud text-sm font-bold tracking-[0.2em] text-gold-100 uppercase">{total ? `${total} ${total === 1 ? 'thing needs' : 'things need'} you` : 'All systems normal'}</p>
        {isAdmin && <ViewAs />}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((i) => (
          <Link key={i.id} to={i.to} className={`gauge group ${i.n ? 'hot' : ''}`}>
            <span className="gauge-n font-mono">{i.n}</span>
            <span className="gauge-label">{i.label}</span>
            <ArrowRight className="gauge-go size-3.5" />
          </Link>
        ))}
      </div>
      {isLead && <LowStockLine />}
    </section>
  );
}

/** Admins see the app the way a rank or one member sees it. Nothing can be saved while previewing. */
function ViewAs() {
  const { ranks, roster, setPreview, realMe } = useHub();
  const [pick, setPick] = useState('');
  return (
    <span className="ml-auto flex flex-wrap items-center gap-2">
      <select className="input w-auto py-1 text-xs" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="View as">
        <option value="">View the app as…</option>
        <optgroup label="A rank">
          {ranks.map((r) => (
            <option key={r.id} value={`r:${r.id}`}>
              {r.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="A member">
          {roster
            .filter((m) => m.id !== realMe.id)
            .map((m) => (
              <option key={m.id} value={`m:${m.id}`}>
                {m.name}
              </option>
            ))}
        </optgroup>
      </select>
      <button
        className="btn-ghost btn-sm"
        disabled={!pick}
        onClick={() => {
          const [k, id] = pick.split(':') as ['r' | 'm', string];
          setPreview(k === 'r' ? { rankId: id } : { memberId: id });
        }}
      >
        <Eye className="size-3.5" /> View
      </button>
    </span>
  );
}
