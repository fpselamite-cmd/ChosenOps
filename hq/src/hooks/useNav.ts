import { DEFAULT_BAR, NAV, WELCOME_TOP, type NavItem } from '../lib/nav';
import { useWelcomeAccess } from '../pages/welcome/useWelcome';
import { useHub } from './useHub';

/** Menu groups with only the pages this person can open. */
export function useNav() {
  const { canSee, me } = useHub();
  const { isAssoc, isHandler } = useWelcomeAccess();
  return NAV.map((g) => ({
    ...g,
    items: g.items
      .filter((i) => (!i.page || canSee(i.page)) && (!i.handlers || (isHandler && !isAssoc)) && (!isAssoc || i.assoc))
      .map((i) => (i.me ? { ...i, to: `/members/${me.id}` } : i)),
  })).filter((g) => g.items.length);
}

/** How a page is saved in the phone bar choice ("/me" for your own page). */
export const barKey = (i: NavItem) => (i.me ? '/me' : i.to);

/** Pages someone can put on the phone bar, and the three they have there now. */
export function usePhoneBar() {
  const { me } = useHub();
  const { isAssoc } = useWelcomeAccess();
  const pages = useNav().flatMap((g) => g.items);
  const pool = [...(isAssoc ? [WELCOME_TOP] : []), ...pages.filter((i) => i.to !== '/' && !(isAssoc && i.to === '/welcome'))];
  const want = me.prefs?.bar ?? (isAssoc ? ['/welcome', ...DEFAULT_BAR] : DEFAULT_BAR);
  const picks: NavItem[] = [];
  for (const k of [...want, ...DEFAULT_BAR, ...pool.map(barKey)]) {
    const i = pool.find((x) => barKey(x) === k);
    if (i && !picks.includes(i)) picks.push(i);
    if (picks.length === 3) break;
  }
  return { pool, picks };
}
