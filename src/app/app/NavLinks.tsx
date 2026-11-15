"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  ["/app", "Dashboard"], ["/app/agents", "Agent Console"], ["/app/bookings", "Bookings"], ["/app/inbox", "Unified Inbox"],
  ["/app/clients", "Clients"], ["/app/loyalty", "Memberships & Loyalty"], ["/app/marketing", "Campaigns & Deals"], ["/app/services", "Services & Rooms"], ["/app/staff", "Staff & Payroll"],
  ["/app/hr", "Recruitment"], ["/app/inventory", "Inventory & POs"], ["/app/billing", "Billing & GST"], ["/app/studio", "AI Studio"], ["/app/settings", "Settings"],
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-4">
      {NAV.map(([href, label]) => {
        const active = href === "/app" ? path === "/app" : path.startsWith(href);
        return (
          <Link key={href} href={href} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${active ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
