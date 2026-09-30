import { useAuth } from '../hooks/useAuth';

export function Crest({ className = 'h-12 w-12' }: { className?: string }) {
  const { branding } = useAuth();
  return (
    <img
      src={branding.logo || '/crest.svg'}
      alt={branding.name}
      className={`${className} object-contain drop-shadow-[0_0_12px_rgba(212,175,55,0.35)]`}
    />
  );
}
