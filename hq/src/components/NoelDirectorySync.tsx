import { useEffect } from 'react';
import { useHub } from '../hooks/useHub';
import { thumbnail } from '../lib/image';
import { fingerprint, noelDirectoryChanges, updateNoelDirectory, useNoel, type NoelHqMember } from '../lib/noelops';

const thumbs = new Map<string, string | null>();

/**
 * Keeps NoelOps' copy of the member directory (name, rank, small picture) in step with the HQ, so NoelOps can show
 * HQ ranks and link to profiles. Any Narco or leadership page does it (only they can write there); only differences
 * are written.
 */
export function NoelDirectorySync() {
  const { ready, me, roster, rankById, narco, preview } = useHub();
  const enabled = ready && me.status === 'active' && narco && !preview;
  const current = useNoel<Record<string, NoelHqMember>>('hq/members', enabled);
  const have = current.data;

  useEffect(() => {
    if (!enabled || have === undefined || current.error) return;
    let stopped = false;
    const t = setTimeout(async () => {
      const want: Record<string, NoelHqMember> = {};
      for (const m of roster) {
        const v = m.avatar ? fingerprint(m.avatar) : '';
        const old = have?.[m.id];
        let avatar: string | null = null;
        if (v && old?.v === v) avatar = old.avatar ?? null;
        else if (m.avatar) {
          if (!thumbs.has(v)) thumbs.set(v, await thumbnail(m.avatar));
          avatar = thumbs.get(v) ?? null;
        }
        if (stopped) return;
        want[m.id] = { name: m.name, rank: rankById.get(m.rankId ?? '')?.name ?? '', avatar, v };
      }
      const changes = noelDirectoryChanges(have ?? {}, want);
      if (Object.keys(changes).length) updateNoelDirectory(changes).catch(() => {});
    }, 2000);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [enabled, have, current.error, roster, rankById]);

  return null;
}
