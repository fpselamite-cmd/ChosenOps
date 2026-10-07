import { deleteDoc, doc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { useRef, useState, type PointerEvent } from 'react';
import { useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import { shrinkImage } from '../lib/image';
import type { Member } from '../lib/types';

/** A member's family card: art the Boss gives each member, like a tarot card crossed with a playing card. */
export interface FamilyCardDoc {
  id: string;
  image: string;
  /** Optional caption under the card, e.g. "The Hanged Man · 7 of Swords". */
  title?: string;
  by: string;
  at?: Timestamp;
}

/** The back of every card: the Chosen seal on a night sky. */
function CardBack() {
  return (
    <div className="fc-face fc-back">
      <div className="absolute inset-3 rounded-[10px] border border-gold-500/60" />
      <div className="absolute inset-[18px] rounded-[7px] border border-dashed border-gold-500/30" />
      <img src="/brand/logo.webp" alt="" className="absolute top-1/2 left-1/2 w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-90 drop-shadow-[0_0_18px_rgba(212,175,55,0.35)]" />
      <span className="star4 twinkle absolute top-6 left-6 size-3" />
      <span className="star4 twinkle absolute right-6 bottom-6 size-3 [animation-delay:1.4s]" />
    </div>
  );
}

export function FamilyCard({ member }: { member: Member }) {
  const { can, me } = useHub();
  const card = useDoc<FamilyCardDoc>(`familyCards/${member.id}`);
  const boss = can('familyCards');
  const [flip, setFlip] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0, gx: 50, gy: 50 });
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const file = useRef<HTMLInputElement>(null);

  if (card === undefined) return null;
  if (!card && !boss) return null;

  function move(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ x: (0.5 - py) * 16, y: (px - 0.5) * 18, gx: px * 100, gy: py * 100 });
  }
  async function upload(f?: File) {
    if (!f) return;
    setBusy(true);
    try {
      const image = await shrinkImage(f, 900, 0.82);
      await setDoc(doc(db, 'familyCards', member.id), { image, title: (title || card?.title || '').slice(0, 60), by: me.id, at: serverTimestamp() });
      setTitle('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hud rise flex flex-col items-center gap-2 p-4">
      <p className="label self-start">
        <span className="star4 mr-1.5 inline-block size-2.5 align-[-1px]" />
        Family card
      </p>
      <div
        className="fc-stage"
        onPointerMove={move}
        onPointerLeave={() => setTilt({ x: 0, y: 0, gx: 50, gy: 50 })}
        onClick={() => card && setFlip(!flip)}
        title={card ? 'Tap to turn it over' : undefined}
      >
        <div className="fc-card" style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y + (flip ? 180 : 0)}deg)` }}>
          <div className="fc-face fc-front">
            {card ? (
              <>
                <img src={card.image} alt={`${member.name}'s family card`} className="size-full object-cover" draggable={false} />
                <span className="fc-shine" style={{ background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,240,190,0.35), transparent 45%), linear-gradient(${105 + tilt.y * 3}deg, transparent 30%, rgba(255,255,255,0.12) 45%, rgba(212,175,55,0.18) 50%, transparent 65%)` }} />
              </>
            ) : (
              <div className="grid size-full place-items-center bg-coal/80 p-4 text-center text-xs text-smoke">
                No family card yet.
                <br />
                Add one below.
              </div>
            )}
          </div>
          <CardBack />
        </div>
      </div>
      {card?.title && <p className="font-display text-sm tracking-wide text-gold-200">{card.title}</p>}
      {boss && (
        <div className="flex w-full max-w-[220px] flex-col gap-1.5">
          <input className="input py-1 text-xs" placeholder={card?.title || 'Caption (optional), e.g. The Fool · Ace'} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
          <div className="flex gap-1">
            <button className="btn-gold btn-sm flex-1" disabled={busy} onClick={() => file.current?.click()}>
              {card ? <RefreshCw className="size-3.5" /> : <ImagePlus className="size-3.5" />} {busy ? 'Saving…' : card ? 'Replace card' : 'Add card'}
            </button>
            {card && (
              <button className="btn-danger btn-sm px-2" onClick={() => confirm(`Remove ${member.name}'s family card?`) && deleteDoc(doc(db, 'familyCards', member.id))} aria-label="Remove card">
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      )}
    </div>
  );
}

/** A small copy of the card for the profile header. Lifts and catches the light on hover. */
export function MiniFamilyCard({ member, onOpen }: { member: Member; onOpen?: () => void }) {
  const card = useDoc<FamilyCardDoc>(`familyCards/${member.id}`);
  if (!card) return null;
  return (
    <button className="fc-mini" onClick={onOpen} title={card.title ? `${card.title} · tap to see it big` : 'Family card · tap to see it big'}>
      <img src={card.image} alt={`${member.name}'s family card`} draggable={false} />
      <span className="fc-mini-shine" />
    </button>
  );
}
