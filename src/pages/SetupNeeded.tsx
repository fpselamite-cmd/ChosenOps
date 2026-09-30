export default function SetupNeeded() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="panel max-w-lg p-8">
        <h1 className="gold-text text-2xl font-black">Firebase not configured</h1>
        <p className="mt-3 text-sm text-smoke">
          Copy <code className="text-gold-200">.env.example</code> to <code className="text-gold-200">.env</code> and fill in
          your Firebase web app config, then restart the dev server. To try it locally without a Firebase project, run{' '}
          <code className="text-gold-200">npm run emulators</code> and <code className="text-gold-200">npm run dev:emu</code>.
        </p>
      </div>
    </div>
  );
}
