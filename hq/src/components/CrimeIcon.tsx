import { Banknote, Car, Crosshair, Flame, Gem, LockOpen, Package, Skull, Star, Store, Truck, Zap, type LucideIcon } from 'lucide-react';

/** The icons a petty crime type can wear (picked in Admin → Lists). */
export const CRIME_ICON: Record<string, LucideIcon> = {
  package: Package,
  car: Car,
  flame: Flame,
  crosshair: Crosshair,
  star: Star,
  gem: Gem,
  banknote: Banknote,
  'lock-open': LockOpen,
  skull: Skull,
  zap: Zap,
  truck: Truck,
  store: Store,
};

export function CrimeIcon({ icon, className = 'size-4' }: { icon?: string; className?: string }) {
  const I = CRIME_ICON[icon ?? ''] ?? Star;
  return <I className={className} />;
}
