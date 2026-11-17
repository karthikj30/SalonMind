"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bot, BriefcaseBusiness, CalendarDays, Crown, LayoutDashboard, Megaphone, Menu, MessagesSquare, Package,
  Receipt, Scissors, Search, Settings, Sparkles, UserCog, Users, X,
} from "lucide-react";
import { Logo } from "@/components/Logo";

const GROUPS = [
  { label: "Front desk", items: [["/app", "Dashboard", LayoutDashboard], ["/app/bookings", "Bookings", CalendarDays], ["/app/inbox", "Unified Inbox", MessagesSquare]] },
  { label: "Clients & growth", items: [["/app/clients", "Clients", Users], ["/app/loyalty", "Memberships & Loyalty", Crown], ["/app/marketing", "Campaigns & Deals", Megaphone]] },
  { label: "Operations", items: [["/app/services", "Services & Rooms", Scissors], ["/app/staff", "Staff & Payroll", UserCog], ["/app/hr", "Recruitment", BriefcaseBusiness], ["/app/inventory", "Inventory & POs", Package]] },
  { label: "Finance", items: [["/app/billing", "Billing & GST", Receipt]] },
  { label: "AI", items: [["/app/agents", "Agent Console", Bot], ["/app/studio", "AI Studio", Sparkles], ["/app/settings", "Settings", Settings]] },
] as const;

export function Sidebar({ salon, footer }: { salon: string; footer: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const nav = (
    <nav className="flex-1 space-y-3.5 overflow-y-auto px-3 py-3 [scrollbar-width:thin]" aria-label="Main">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-champ-300/70">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map(([href, label, Icon]) => {
              const active = href === "/app" ? path === "/app" : path.startsWith(href);
              return (
                <li key={href}>
                  <Link href={href} aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition-all duration-200 hover:translate-x-0.5 ${active ? "bg-white/15 font-medium text-white shadow-[inset_2px_0_0_#dcb860]" : "text-onplum/75 hover:bg-white/5 hover:text-white"}`}>
                    <Icon className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${active ? "text-champ-300" : "text-onplum-muted/60 group-hover:text-champ-300"}`} aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
  const panel = (
    <div className="flex h-full flex-col bg-plum-gradient text-white">
      <div className="px-5 pb-3 pt-4">
        <Link href="/app" className="group flex items-center gap-2.5"><Logo className="h-9 w-9 transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110" /><span className="font-display text-xl font-semibold">SalonMind</span></Link>
        <p className="mt-2.5 truncate rounded-lg bg-white/10 px-3 py-1.5 text-xs text-onplum/85" title={salon}>✦ {salon}</p>
      </div>
      <button type="button" onClick={() => window.dispatchEvent(new Event("sm-palette"))} className="mx-4 mb-3 flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-left text-xs text-onplum/70 transition hover:bg-white/10" aria-label="Search and commands">
        <Search className="h-3.5 w-3.5" aria-hidden /><span className="flex-1">Search or command…</span><kbd className="rounded border border-white/20 px-1 text-[10px]">Ctrl K</kbd>
      </button>
      <div className="gold-rule mx-5 opacity-40" />
      {nav}
      <div className="border-t border-white/10 px-4 py-3 text-xs text-onplum/70">{footer}</div>
    </div>
  );
  return (
    <>
      <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-plum-gradient px-4 py-3 text-white md:hidden">
        <Link href="/app" className="flex items-center gap-2"><Logo className="h-8 w-8" /><span className="font-display text-lg font-semibold">SalonMind</span></Link>
        <div className="flex items-center">
          <button onClick={() => window.dispatchEvent(new Event("sm-palette"))} className="rounded-lg p-2 hover:bg-white/10" aria-label="Search and commands"><Search className="h-5 w-5" /></button>
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        </div>
      </header>
      {/* phone: thumb-reach tab bar for the pages used all day */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-brand-100 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Quick navigation">
        {([["/app", "Home", LayoutDashboard], ["/app/bookings", "Bookings", CalendarDays], ["/app/inbox", "Inbox", MessagesSquare], ["/app/clients", "Clients", Users]] as const).map(([href, label, Icon]) => {
          const active = href === "/app" ? path === "/app" : path.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium transition ${active ? "text-brand-700" : "text-brand-900/50"}`}>
              <span className={`grid h-7 w-12 place-items-center rounded-full transition ${active ? "bg-brand-100" : ""}`}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>{label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium text-brand-900/50" aria-label="More pages">
          <span className="grid h-7 w-12 place-items-center"><Menu className="h-[18px] w-[18px]" aria-hidden /></span>More
        </button>
      </nav>
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 md:block">{panel}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 w-72 animate-slide-in-left shadow-lift">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-white hover:bg-white/10" aria-label="Close menu"><X className="h-5 w-5" /></button>
            {panel}
          </div>
        </div>
      )}
    </>
  );
}
