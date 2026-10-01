import { useState } from 'react';
import { Empty, PageHeader } from '../components/Field';
import { JournalCard, JournalForm } from '../components/Journal';
import { useLore } from '../hooks/useLore';

export default function Journals() {
  const { journals } = useLore();
  const [writing, setWriting] = useState(false);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Journals"
        subtitle="Pages torn from the family's private diaries, newest first."
        actions={
          <button className="btn-gold" onClick={() => setWriting(true)}>
            ✎ Write in my journal
          </button>
        }
      />
      {journals.length === 0 ? (
        <Empty>No one has written in their journal yet.</Empty>
      ) : (
        <div className="space-y-4">
          {journals.map((j) => (
            <JournalCard key={j.id} entry={j} showAuthor collapsed />
          ))}
        </div>
      )}
      {writing && <JournalForm entry={null} onClose={() => setWriting(false)} />}
    </div>
  );
}
