import { Check, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useHub } from '../hooks/useHub';
import { addToShopping, useShopping, type ShopItem } from '../lib/shopping';

/** "+ Personal Wishlist": puts catalog items on my own wishlist (My Locker). Shows a tick once they're all on it. */
export function WishlistButton({ items, label = 'Personal Wishlist', className = 'btn-ghost btn-sm' }: { items: ShopItem[]; label?: string; className?: string }) {
  const { me } = useHub();
  const list = useShopping(me.id);
  const [busy, setBusy] = useState(false);
  const adds = items.filter((i) => i.item && i.qty > 0);
  if (!list || !adds.length) return null;
  const on = adds.every((a) => list.some((x) => x.item === a.item && x.qty >= a.qty));
  return (
    <button
      type="button"
      className={className}
      disabled={on || busy}
      title={on ? 'Already on your Personal Wishlist' : 'Add to your Personal Wishlist'}
      onClick={(e) => {
        e.stopPropagation();
        setBusy(true);
        addToShopping(me.id, list, adds).finally(() => setBusy(false));
      }}
    >
      {on ? <Check className="size-3.5 text-ok" /> : <ShoppingCart className="size-3.5" />} {on ? 'On my wishlist' : `+ ${label}`}
    </button>
  );
}
