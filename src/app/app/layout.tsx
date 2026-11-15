import Link from "next/link";
import { getTenantContext } from "@/lib/tenant";
import { signOut, switchSalon } from "../auth-actions";
import { aiEnabled } from "@/lib/ai/llm";
import { NavLinks } from "./NavLinks";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { tenant, salons, user } = await getTenantContext();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="no-print border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="flex items-center justify-between p-4 md:block">
          <Link href="/app" className="text-lg font-bold text-brand-700">✂️ SalonMind</Link>
          <p className="truncate text-xs text-slate-500 md:mt-1">{tenant.name}</p>
        </div>
        <NavLinks />
        <div className="space-y-2 border-t p-3 text-xs text-slate-500">
          <p>AI: {aiEnabled() ? <span className="text-emerald-600">LLM connected</span> : <span className="text-amber-600">rules-engine mode</span>}</p>
          {salons.length > 1 && (
            <form action={switchSalon} className="flex gap-1">
              <select name="tenant_id" defaultValue={tenant.id} className="w-full rounded border px-1 py-0.5">
                {salons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className="rounded border px-1">Go</button>
            </form>
          )}
          <p className="truncate">{user.email}</p>
          <div className="flex gap-3">
            <Link href="/onboarding" className="hover:text-brand-600">+ New salon</Link>
            <form action={signOut}><button className="hover:text-brand-600">Sign out</button></form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
