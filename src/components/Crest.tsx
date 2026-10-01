import { useAuth } from '../hooks/useAuth';

export const DEFAULT_LOGO = '/brand/logo.webp';

/** The family seal. An uploaded logo (Admin → Family Settings) overrides the built-in one. */
export function Crest({ className = 'h-12 w-12', spin = false }: { className?: string; spin?: boolean }) {
  const { branding } = useAuth();
  return (
    <img
      src={branding.logo || DEFAULT_LOGO}
      alt={branding.name}
      className={`${className} rounded-full object-contain drop-shadow-[0_0_18px_rgba(212,175,55,0.35)] ${spin ? 'seal-spin' : ''}`}
    />
  );
}
