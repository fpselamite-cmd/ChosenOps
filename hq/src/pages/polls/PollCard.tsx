import { CalendarDays, Check, Crown, EyeOff, Lock, MessageCircle, MoreHorizontal, RotateCcw, Save, Send, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AvatarStack } from '../../components/Avatar';
import { useCollection, useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { DEFAULT_CASINO, type CasinoSettings } from '../../lib/casino';
import { ago, fmtDate } from '../../lib/format';
import type { Member } from '../../lib/types';
import {
  addComment,
  AUDIENCES,
  castVote,
  changeVote,
  closePoll,
  deletePoll,
  maxPicks,
  motionCarried,
  optionLabel,
  pollOpen,
  POLL_KINDS,
  removeComment,
  reopenPoll,
  saveTemplate,
  tally,
  type Poll,
  type PollComment,
} from '../../lib/polls';
import { sfx } from '../../lib/sound';
import { useEligible, useMyVote, useNow, useVotes } from './usePolls';

function left(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60 ? `${m % 60}m` : ''}`.trim();
  return `${Math.floor(h / 24)}d ${h % 24 ? `${h % 24}h` : ''}`.trim();
}

/** The High Table's wax seal on an official motion. Stamps in when the motion closes. */
export function Seal({ stamped, carried }: { stamped?: boolean; carried?: boolean | null }) {
  return (
    <span className={`poll-seal ${stamped ? 'stamped' : ''} ${carried === false ? 'failed' : ''}`} title="Official High Table motion">
      <Crown className="size-5" strokeWidth={2.2} />
      <small>{stamped ? (carried === false ? 'FAILED' : carried ? 'CARRIED' : 'SEALED') : 'OFFICIAL'}</small>
    </span>
  );
}

function Comments({ p }: { p: Poll }) {
  const { me, isLead, preview } = useHub();
  const rows = useCollection<PollComment>(`polls/${p.id}/comments`) ?? [];
  const list = useMemo(() => [...rows].sort((a, b) => (a.at?.toMillis() ?? Date.now()) - (b.at?.toMillis() ?? Date.now())), [rows]);
  const [text, setText] = useState('');
  return (
    <div className="mt-3 space-y-2 border-t border-dashed border-gold-700/30 pt-3">
      {list.map((c) => (
        <p key={c.id} className="group text-sm">
          <b className="text-gold-200">{c.name}</b> <span className="text-ash">{c.text}</span> <span className="text-[10px] text-smoke">{ago(c.at)}</span>
          {(c.by === me.id || isLead) && (
            <button className="ml-1 text-smoke opacity-0 group-hover:opacity-100 hover:text-red-300" onClick={() => removeComment(p.id, c.id)} aria-label="Delete comment">
              <Trash2 className="inline size-3" />
            </button>
          )}
        </p>
      ))}
      {!list.length && <p className="text-xs text-smoke">No one has made their case yet.</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || preview) return;
          void addComment(me, p.id, text).then(() => setText(''));
        }}
      >
        <input className="input flex-1 !py-1.5 text-sm" value={text} maxLength={280} placeholder="Make your case…" onChange={(e) => setText(e.target.value)} />
        <button className="btn-ghost btn-sm" disabled={!text.trim()} aria-label="Post comment">
          <Send className="size-3.5" />
        </button>
      </form>
    </div>
  );
}

function LeadMenu({ p, open }: { p: Poll; open: boolean }) {
  const { preview } = useHub();
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  if (preview) return null;
  return (
    <span className="relative">
      <button className="p-1 text-smoke hover:text-gold-200" onClick={() => setShow(!show)} aria-label="Poll options">
        <MoreHorizontal className="size-4" />
      </button>
      {show && (
        <span className="poll-menu" onMouseLeave={() => setShow(false)}>
          {open ? (
            <button onClick={() => (setShow(false), closePoll(p.id))}>
              <Lock className="size-3.5" /> Close voting now
            </button>
          ) : (
            <button onClick={() => (setShow(false), reopenPoll(p.id, new Date(Date.now() + 86_400_000)))}>
              <RotateCcw className="size-3.5" /> Reopen for 24 hours
            </button>
          )}
          <button
            onClick={() => {
              const name = prompt('Name this template', p.question.slice(0, 40));
              if (!name) return;
              void saveTemplate({
                name,
                question: p.question,
                note: p.note,
                kind: p.kind,
                options: p.kind === 'dates' ? [] : p.options.map((o) => o.label),
                audience: p.audience,
                anonymous: p.anonymous,
                reveal: p.reveal,
                official: p.official,
                hours: p.closesAt && p.at ? Math.max(1, Math.round((p.closesAt.toMillis() - p.at.toMillis()) / 3_600_000)) : 0,
              }).then(() => setSaved(true));
            }}
          >
            <Save className="size-3.5" /> {saved ? 'Saved as template' : 'Save as template'}
          </button>
          <button className="text-red-300" onClick={() => confirm('Delete this poll and every vote on it?') && deletePoll(p)}>
            <Trash2 className="size-3.5" /> Delete poll
          </button>
        </span>
      )}
    </span>
  );
}

/** A poll as a ballot card: vote on it, then watch the gold bars fill. */
export function PollCard({ p, compact }: { p: Poll; compact?: boolean }) {
  const { me, isLead, memberById, preview } = useHub();
  const now = useNow();
  const open = pollOpen(p, now);
  const { voted, voteId, vote } = useMyVote(p);
  const votes = useVotes(p);
  const eligible = useEligible(p);
  const casino = { ...DEFAULT_CASINO, ...(useDoc<CasinoSettings>('settings/casino') ?? {}) };
  const [picks, setPicks] = useState<string[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [talk, setTalk] = useState(false);
  const comments = useCollection<{ id: string }>(`polls/${p.id}/comments`, !compact) ?? [];

  const mine = vote?.picks ?? [];
  const chosen = picks ?? (editing ? mine : []);
  const many = maxPicks(p) > 1;
  const t = votes ? tally(p, votes) : null;
  const carried = p.kind === 'yesno' && t && t.total ? motionCarried(p, t) : null;
  const choosing = open && (!voted || editing);
  const kind = POLL_KINDS.find((k) => k.id === p.kind)!;

  const toggle = (id: string) => {
    if (!choosing) return;
    sfx.tick();
    setPicks(many ? (chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]) : [id]);
  };
  const submit = async () => {
    if (!chosen.length || preview) return;
    setBusy(true);
    try {
      if (voted && voteId) await changeVote(p.id, voteId, chosen);
      else await castVote(me, p, chosen);
      sfx.chip();
      setFlash(voted ? 'Vote changed' : casino.perVote ? `Vote cast · +${casino.perVote} chips` : 'Vote cast');
      setTimeout(() => setFlash(''), 3500);
      setEditing(false);
      setPicks(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`ballot ${p.official ? 'ballot-official' : ''} ${compact ? 'ballot-compact' : ''} ${open ? '' : 'ballot-closed'}`}>
      {p.official && <Seal stamped={!open} carried={carried} />}
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-14 text-[10px]">
        <span className="label text-gold-500">{p.official ? 'Official motion' : kind.label}</span>
        <span className="poll-tag">
          <Users className="size-3" /> {AUDIENCES.find((a) => a.id === p.audience)!.label}
        </span>
        {p.anonymous && (
          <span className="poll-tag">
            <EyeOff className="size-3" /> Anonymous
          </span>
        )}
        {p.reveal === 'closed' && open && (
          <span className="poll-tag">
            <Lock className="size-3" /> Results at close
          </span>
        )}
      </header>
      <h3 className="ballot-q">{p.question}</h3>
      {p.note && !compact && <p className="mt-1 text-sm whitespace-pre-line text-ash">{p.note}</p>}
      <p className="mt-1 text-[11px] text-smoke">
        Asked by {p.byName}
        {' · '}
        {open ? (p.closesAt ? <span className="text-gold-300">closes in {left(p.closesAt.toMillis() - now)}</span> : 'no deadline') : `closed ${fmtDate(p.closedAt ?? p.closesAt)}`}
      </p>

      <ul className="mt-3 space-y-1.5">
        {p.options.map((o) => {
          const on = chosen.includes(o.id);
          const was = mine.includes(o.id);
          const n = t?.counts.get(o.id) ?? 0;
          const pct = t && t.total ? Math.round((n / t.total) * 100) : 0;
          const win = !!t && t.winners.includes(o.id) && !open;
          const who = !p.anonymous && t ? (t.who.get(o.id) ?? []).map((v) => memberById.get(v.memberId ?? '')).filter((m): m is Member => !!m) : [];
          return (
            <li key={o.id}>
              <button
                type="button"
                className={`ballot-opt ${on ? 'on' : ''} ${win ? 'win' : ''} ${choosing ? '' : 'static'}`}
                onClick={() => toggle(o.id)}
                aria-pressed={on}
                disabled={!choosing}
              >
                {t && !choosing && <span className="ballot-bar" style={{ width: `${pct}%` }} />}
                <span className={`ballot-box ${many ? 'sq' : ''}`}>{(on || (!choosing && was)) && <Check className="size-3" strokeWidth={3} />}</span>
                {p.kind === 'dates' && <CalendarDays className="size-3.5 shrink-0 text-gold-500" />}
                <span className="relative min-w-0 flex-1 truncate text-left">{optionLabel(p, o)}</span>
                {win && <Crown className="relative size-3.5 shrink-0 text-gold-300" />}
                {t && !choosing && (
                  <span className="relative flex shrink-0 items-center gap-2">
                    {!!who.length && !compact && <AvatarStack members={who} max={4} />}
                    <span className="font-mono text-xs text-gold-100">
                      {n} <span className="text-smoke">· {pct}%</span>
                    </span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {voted && !t && !editing && <p className="mt-2 text-xs text-smoke">Your vote is in. The results open when voting closes.</p>}
      {flash && <p className="ballot-flash">{flash}</p>}

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        {choosing ? (
          <>
            <button className="btn-gold btn-sm" disabled={!chosen.length || busy || !!preview} onClick={submit}>
              <Check className="size-3.5" /> {voted ? 'Change my vote' : 'Cast vote'}
            </button>
            {editing && (
              <button className="btn-ghost btn-sm" onClick={() => (setEditing(false), setPicks(null))}>
                Cancel
              </button>
            )}
            {many && <span className="text-[11px] text-smoke">{p.kind === 'dates' ? 'Tick every time that works' : 'Pick any'}</span>}
          </>
        ) : (
          open &&
          voted && (
            <button className="text-xs text-smoke hover:text-gold-200" onClick={() => setEditing(true)}>
              Change my vote
            </button>
          )
        )}
        <span className="ml-auto flex items-center gap-3 text-[11px] text-smoke">
          <span>
            <b className="font-mono text-gold-200">{p.voters.length}</b>/{eligible} voted
          </span>
          {!compact && (
            <button className={`flex items-center gap-1 hover:text-gold-200 ${talk ? 'text-gold-200' : ''}`} onClick={() => setTalk(!talk)}>
              <MessageCircle className="size-3.5" /> {comments.length}
            </button>
          )}
          {isLead && !compact && <LeadMenu p={p} open={open} />}
        </span>
      </footer>
      {talk && !compact && <Comments p={p} />}
    </article>
  );
}
