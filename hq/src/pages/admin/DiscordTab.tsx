import { doc, setDoc } from 'firebase/firestore';
import { Check, Eye, EyeOff, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Field } from '../../components/Field';
import { Panel } from '../../components/Page';
import { useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { HOOK_EVENTS, postTo, VALID_HOOK, type Channel, type Hooks } from '../../lib/discord';
import { db } from '../../lib/firebase';

const CHANNELS: { id: keyof Hooks; title: string; sub: string; sample: { title: string; description: string; fields: { name: string; value: string; inline?: boolean }[] } }[] = [
  {
    id: 'blacksites',
    title: 'Blacksites',
    sub: 'Fight logs and confirmed rep, e.g. into #blacksites.',
    sample: {
      title: '🏴 Blacksite: Docks',
      description: 'Held it vs Ballas · held 41m',
      fields: [
        { name: 'Who was there', value: 'Rocco Vale, Dani Cruz, Kira Lane' },
        { name: 'Rep', value: '+250 (waiting on Lieutenant+)', inline: true },
      ],
    },
  },
  {
    id: 'rep',
    title: 'Rep donations',
    sub: 'Petty rep sent to the family, and when it’s confirmed.',
    sample: { title: '🤝 Rep sent to the family', description: '**Kira Lane** is sending **150** petty rep. Waiting on a Lieutenant+ to confirm.', fields: [] },
  },
];

/** A Discord-looking preview of a post. */
function Preview({ ch, sample }: { ch: Channel; sample: (typeof CHANNELS)[number]['sample'] }) {
  return (
    <div className="rounded-md bg-[#313338] p-3 font-sans text-[13px] text-[#dbdee1]">
      <div className="flex gap-3">
        <div className="size-9 shrink-0 overflow-hidden rounded-full bg-gold-700">
          {ch.avatarUrl ? <img src={ch.avatarUrl} alt="" className="size-full object-cover" /> : <img src="/brand/logo-192.png" alt="" className="size-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p>
            <b className="text-white">{ch.username || 'ChosenOps HQ'}</b> <span className="ml-1 rounded bg-[#5865f2] px-1 text-[10px] text-white">APP</span>
            <span className="ml-2 text-[11px] text-[#949ba4]">Today at 9:41 PM</span>
          </p>
          <div className="mt-1 max-w-md rounded border-l-4 border-[#d4af37] bg-[#2b2d31] p-3">
            <p className="font-semibold text-white">{sample.title}</p>
            <p className="mt-1" dangerouslySetInnerHTML={{ __html: sample.description.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />
            {sample.fields.map((f) => (
              <div key={f.name} className="mt-2">
                <p className="text-[12px] font-semibold text-white">{f.name}</p>
                <p>{f.value}</p>
              </div>
            ))}
            <p className="mt-2 text-[11px] text-[#949ba4]">ChosenOps HQ</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChannelCard({ def, value, onSave }: { def: (typeof CHANNELS)[number]; value: Channel; onSave: (c: Channel) => Promise<void> }) {
  const [ch, setCh] = useState<Channel>(value);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => setCh(value), [value]);
  const events = HOOK_EVENTS.filter((e) => e.channel === def.id);
  const bad = !!ch.url && !VALID_HOOK.test(ch.url);
  const anyOn = events.some((e) => ch.on?.[e.id]);
  return (
    <Panel title={def.title} right={<span className={`chip px-2 py-0.5 text-[10px] ${ch.url && anyOn ? 'bg-ok/20 text-ok' : 'bg-raised text-smoke'}`}>{ch.url && anyOn ? 'On' : 'Off'}</span>}>
      <p className="mb-3 text-sm text-smoke">{def.sub}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Webhook URL" hint="Discord → channel settings → Integrations → Webhooks → Copy URL.">
            <div className="flex gap-1">
              <input
                className={`input font-mono text-xs ${bad ? 'border-danger' : ''}`}
                type={show ? 'text' : 'password'}
                value={ch.url ?? ''}
                onChange={(e) => (setCh({ ...ch, url: e.target.value.trim() }), setMsg(''))}
                placeholder="https://discord.com/api/webhooks/…"
                autoComplete="off"
              />
              <button type="button" className="btn-ghost px-2" onClick={() => setShow(!show)} aria-label={show ? 'Hide' : 'Show'}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Posts as">
              <input className="input" value={ch.username ?? ''} onChange={(e) => setCh({ ...ch, username: e.target.value.slice(0, 40) })} placeholder="ChosenOps HQ" />
            </Field>
            <Field label="Picture URL">
              <input className="input text-xs" value={ch.avatarUrl ?? ''} onChange={(e) => setCh({ ...ch, avatarUrl: e.target.value.trim() })} placeholder="optional" />
            </Field>
          </div>
          <div className="space-y-1.5">
            <span className="label">Post when</span>
            {events.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 accent-[#d4af37]" checked={!!ch.on?.[e.id]} onChange={(x) => setCh({ ...ch, on: { ...ch.on, [e.id]: x.target.checked } })} />
                <span>
                  <span className="text-gold-100">{e.label}</span>
                  <span className="block text-xs text-smoke">{e.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-gold btn-sm" disabled={bad} onClick={async () => (await onSave(ch), setMsg('Saved.'))}>
              <Check className="size-3.5" /> Save
            </button>
            <button
              className="btn-ghost btn-sm"
              disabled={!ch.url || bad}
              onClick={async () => {
                try {
                  await postTo(ch, { ...def.sample, title: `${def.sample.title} (test)` });
                  setMsg('Test sent — check the channel.');
                } catch (err) {
                  setMsg((err as Error).message);
                }
              }}
            >
              <Send className="size-3.5" /> Send a test
            </button>
            {msg && <span className="text-xs text-gold-300">{msg}</span>}
            {bad && <span className="text-xs text-danger">That doesn’t look like a Discord webhook URL.</span>}
          </div>
        </div>
        <div>
          <span className="label mb-1.5 block">Preview</span>
          <Preview ch={ch} sample={def.sample} />
        </div>
      </div>
    </Panel>
  );
}

export default function DiscordTab() {
  const hooks = useDoc<Hooks & { id: string }>('hooks/discord');
  const { me } = useHub();
  if (hooks === undefined) return null;
  const save = (id: keyof Hooks) => (c: Channel) => setDoc(doc(db, 'hooks', 'discord'), { [id]: c, by: me.id }, { merge: true });
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-ash">
        Everything is off until a webhook is pasted and an event is ticked. Webhooks are stored in the HQ’s database, not in the code. Members’ phones send the posts, so anyone signed in could find a
        webhook URL; if one leaks, delete it in Discord and paste a new one here.
      </p>
      {CHANNELS.map((c) => (
        <ChannelCard key={c.id} def={c} value={hooks?.[c.id] ?? {}} onSave={save(c.id)} />
      ))}
    </div>
  );
}
