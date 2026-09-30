import { useState } from 'react';
import { Empty, PageHeader } from '../../components/Field';
import { useHub } from '../../hooks/useHub';
import FamilySettingsTab from './FamilySettingsTab';
import MembersTab from './MembersTab';
import PendingTab from './PendingTab';
import RanksTab from './RanksTab';

export default function Admin() {
  const { can, members } = useHub();
  const pending = members.filter((m) => m.status === 'pending').length;
  const tabs = [
    { id: 'pending', label: `Pending${pending ? ` (${pending})` : ''}`, show: can('approveMembers'), el: <PendingTab /> },
    { id: 'members', label: 'Members', show: can('manageMembers') || can('resetPins'), el: <MembersTab /> },
    { id: 'ranks', label: 'Ranks & Permissions', show: can('manageRanks'), el: <RanksTab /> },
    { id: 'family', label: 'Family Settings', show: can('manageSettings'), el: <FamilySettingsTab /> },
  ].filter((t) => t.show);
  const [tab, setTab] = useState(tabs[0]?.id);

  if (!tabs.length) return <Empty>Your rank has no admin access.</Empty>;
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <div>
      <PageHeader title="Admin" subtitle="Running the family. You can only act on ranks below your own." />
      <div className="mb-6 flex flex-wrap gap-1 border-b border-edge">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 font-display text-sm tracking-wider ${
              current.id === t.id ? 'border-gold-400 text-gold-200' : 'border-transparent text-smoke hover:text-bone'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current.el}
    </div>
  );
}
