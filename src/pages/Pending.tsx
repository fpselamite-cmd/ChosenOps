import { Crest } from '../components/Crest';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../lib/auth';

export default function Pending({ locked = false }: { locked?: boolean }) {
  const { me, branding } = useAuth();
  const suspended = me?.status === 'suspended';
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="panel max-w-md p-8 text-center">
        <Crest className="mx-auto h-20 w-20" />
        <h1 className="gold-text mt-4 text-2xl font-black">{locked ? 'Session Expired' : suspended ? 'Access Revoked' : 'Awaiting Word'}</h1>
        <p className="mt-3 text-sm text-smoke">
          {locked ? (
            <>Your PIN has been changed. Sign out and sign back in with your new PIN.</>
          ) : suspended ? (
            <>Your standing with {branding.name} is under review. Speak to leadership.</>
          ) : (
            <>
              Welcome, <span className="text-gold-200">{me?.username}</span>. Your request has been passed up the chain. Once
              someone vouches for you, this page will open up on its own.
            </>
          )}
        </p>
        <div className="divider-gold my-6" />
        <button className="btn-ghost" onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
