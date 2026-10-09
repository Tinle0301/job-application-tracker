/** Shown in production builds that are missing the Supabase settings, instead of silently running demo mode. */
export function ConfigError({ missing }: { missing: string[] }) {
  return (
    <main className="mx-auto mt-24 max-w-lg space-y-4 px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Job Application Tracker</h1>
      <div
        role="alert"
        className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900"
      >
        <p className="font-semibold">This deployment isn't connected to its database yet.</p>
        <p>These environment variables were not set when the site was built:</p>
        <ul className="list-disc pl-5 font-mono">
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <p>
          Add them in Vercel → Project → Settings → Environment Variables (for Production), then redeploy. See
          docs/SETUP.md.
        </p>
      </div>
    </main>
  )
}
