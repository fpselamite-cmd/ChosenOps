import { ShieldCheck } from 'lucide-react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '../../components/Page';
import { useHub } from '../../hooks/useHub';
import AccessTab from './AccessTab';
import DiscordTab from './DiscordTab';
import ItemsTab from './ItemsTab';
import MembersTab from './MembersTab';
import PendingTab from './PendingTab';
import RanksTab from './RanksTab';
import SettingsTab from './SettingsTab';

type Tab = 'pending' | 'members' | 'ranks' | 'items' | 'discord' | 'access' | 'settings';

export default function Admin() {
  const { can, members, isOwner } = useHub();
  const [params, setParams] = useSearchParams();
  const pending = members.filter((m) => m.status === 'pending').length;

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'pending', label: `Waiting${pending ? ` · ${pending}` : ''}`, show: can('approveMembers') },
    { id: 'members', label: 'Members', show: can('manageMembers') || can('resetPins') },
    { id: 'ranks', label: 'Ranks & permissions', show: can('manageRanks') },
    { id: 'items', label: 'Item catalog', show: can('manageOps') },
    { id: 'discord', label: 'Discord', show: can('manageSettings') },
    { id: 'access', label: 'Admin access', show: isOwner },
    { id: 'settings', label: 'Gang settings', show: can('manageSettings') },
  ];
  const visible = tabs.filter((t) => t.show);
  if (!visible.length) return <Navigate to="/" replace />;
  const tab = visible.find((t) => t.id === params.get('tab'))?.id ?? visible[0]!.id;

  return (
    <>
      <PageHeader icon={ShieldCheck} kicker="Command" title="Admin" sub="You can only act on people and ranks below your own rank." />
      <div className="mb-6">
        <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={visible} />
      </div>
      {tab === 'pending' && <PendingTab />}
      {tab === 'members' && <MembersTab />}
      {tab === 'ranks' && <RanksTab />}
      {tab === 'items' && <ItemsTab />}
      {tab === 'discord' && <DiscordTab />}
      {tab === 'access' && <AccessTab />}
      {tab === 'settings' && <SettingsTab />}
    </>
  );
}
