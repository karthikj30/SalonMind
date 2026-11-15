"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bot, BriefcaseBusiness, CalendarDays, Crown, LayoutDashboard, Megaphone, Menu, MessagesSquare, Package,
  Receipt, Scissors, Settings, Sparkles, UserCog, Users, X,
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
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-300/70">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map(([href, label, Icon]) => {
              const active = href === "/app" ? path === "/app" : path.startsWith(href);
              return (
                <li key={href}>
                  <Link href={href} aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition ${active ? "bg-white/15 font-medium text-white shadow-[inset_2px_0_0_#dcb860]" : "text-brand-100/75 hover:bg-white/5 hover:text-white"}`}>
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-gold-300" : "text-brand-200/60 group-hover:text-gold-300"}`} aria-hidden />
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
        <Link href="/app" className="flex items-center gap-2.5"><Logo className="h-9 w-9" /><span className="font-display text-xl font-semibold">SalonMind</span></Link>
        <p className="mt-2.5 truncate rounded-lg bg-white/10 px-3 py-1.5 text-xs text-brand-100/85" title={salon}>✦ {salon}</p>
      </div>
      <div className="gold-rule mx-5 opacity-40" />
      {nav}
      <div className="border-t border-white/10 px-4 py-3 text-xs text-brand-100/70">{footer}</div>
    </div>
  );
  return (
    <>
      <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-plum-gradient px-4 py-3 text-white md:hidden">
        <Link href="/app" className="flex items-center gap-2"><Logo className="h-8 w-8" /><span className="font-display text-lg font-semibold">SalonMind</span></Link>
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
      </header>
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 md:block">{panel}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-brand-950/50 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 w-72 animate-fade-in shadow-lift">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-white hover:bg-white/10" aria-label="Close menu"><X className="h-5 w-5" /></button>
            {panel}
          </div>
        </div>
      )}
    </>
  );
}
