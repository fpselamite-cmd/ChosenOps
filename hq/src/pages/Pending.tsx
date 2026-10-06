import { Hourglass, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../lib/auth';

export default function Pending({ locked }: { locked?: boolean }) {
  const { me } = useAuth();
  const suspended = me?.status === 'suspended';
  const Icon = locked || suspended ? Lock : Hourglass;
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="hud max-w-md p-8 text-center">
        <img src="/brand/logo-192.png" alt="" className="mx-auto size-20 opacity-90" />
        <Icon className="mx-auto mt-5 size-6 text-gold-400" />
        <h1 className="foil mt-3 font-display text-2xl font-bold">
          {locked ? 'PIN was reset' : suspended ? 'Access suspended' : 'Waiting at the door'}
        </h1>
        <p className="mt-3 text-sm text-ash">
          {locked
            ? 'Your PIN was reset on another device. Sign in again with your new PIN.'
            : suspended
              ? 'Leadership has suspended your access. Talk to them in the city.'
              : `${me?.name ?? 'You'}, your request is in. Leadership will approve you and give you a rank. This page opens up by itself once they do.`}
        </p>
        <button onClick={logout} className="btn-ghost mt-6">
          Sign out
        </button>
      </div>
    </div>
  );
}
