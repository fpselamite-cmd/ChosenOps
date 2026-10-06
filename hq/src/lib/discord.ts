import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Discord alerts, ready but switched off until leadership pastes a webhook in Admin → Discord.
 * Webhook URLs live in Firestore (hooks/discord), never in the code or the repo.
 */
export type HookEvent = 'blacksite.logged' | 'blacksite.confirmed' | 'rep.sent' | 'rep.confirmed';

export interface Channel {
  url?: string;
  /** Per event: post or not. */
  on?: Partial<Record<HookEvent, boolean>>;
  /** Name and picture the posts go out under. */
  username?: string;
  avatarUrl?: string;
}
export interface Hooks {
  blacksites?: Channel;
  rep?: Channel;
}

export const HOOK_EVENTS: { id: HookEvent; channel: keyof Hooks; label: string; hint: string }[] = [
  { id: 'blacksite.logged', channel: 'blacksites', label: 'A fight is logged', hint: 'Zone, result, rivals, who was there.' },
  { id: 'blacksite.confirmed', channel: 'blacksites', label: 'Its rep is confirmed', hint: 'Rep added to the family, MVP.' },
  { id: 'rep.sent', channel: 'rep', label: 'Someone sends rep to the family', hint: 'Waiting for a Lieutenant+.' },
  { id: 'rep.confirmed', channel: 'rep', label: 'A donation is confirmed', hint: 'New family rep total.' },
];

export const GOLD = 0xd4af37;
export const VALID_HOOK = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export interface Embed {
  title: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

/** Posts straight to a webhook. */
export async function postTo(ch: Channel, embed: Embed) {
  if (!ch.url || !VALID_HOOK.test(ch.url)) throw new Error('No webhook set.');
  const res = await fetch(ch.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ch.username || 'ChosenOps HQ',
      ...(ch.avatarUrl ? { avatar_url: ch.avatarUrl } : {}),
      embeds: [{ color: GOLD, footer: { text: 'ChosenOps HQ' }, timestamp: new Date().toISOString(), ...embed }],
    }),
  });
  if (!res.ok) throw new Error(`Discord said ${res.status}.`);
}

/** Fire-and-forget: posts if that event is switched on, otherwise does nothing. */
export async function notify(event: HookEvent, embed: Embed) {
  try {
    const hooks = (await getDoc(doc(db, 'hooks', 'discord'))).data() as Hooks | undefined;
    const ch = hooks?.[HOOK_EVENTS.find((e) => e.id === event)!.channel];
    if (ch?.on?.[event] && ch.url) await postTo(ch, embed);
  } catch {
    // Alerts never get in the way of the app.
  }
}
