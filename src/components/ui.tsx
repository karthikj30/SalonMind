import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";

export function Card({ title, children, actions, className = "", icon }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <section className={`min-w-0 animate-fade-up rounded-2xl border border-brand-100/80 bg-surface p-4 shadow-soft transition-shadow duration-300 hover:shadow-lift sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <div className="flex min-w-0 items-center gap-2">
              {icon && <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600" aria-hidden>{icon}</span>}
              <h2 className="text-sm font-semibold text-brand-900">{title}</h2>
            </div>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, children, eyebrow }: { title: string; subtitle?: string; children?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-600">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-semibold text-brand-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-brand-900/60">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

const btn = {
  primary: "bg-rose-gold text-white shadow-soft hover:shadow-lift hover:brightness-110",
  secondary: "border border-brand-200 bg-surface text-brand-800 hover:border-brand-300 hover:bg-brand-50",
  ghost: "text-brand-700 hover:bg-brand-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function Button({ children, variant = "primary", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof btn }) {
  return <button className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition active:scale-[.97] disabled:opacity-50 ${btn[variant]} ${className}`} {...rest}>{children}</button>;
}

export function LinkButton({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  return <Link href={href} className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition active:scale-[.97] ${btn[variant]}`}>{children}</Link>;
}

const inputCls = "w-full rounded-xl border border-brand-200/80 bg-ivory-50 px-3 py-2 text-sm text-brand-950 placeholder:text-brand-900/35 transition focus:border-brand-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-200";

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block text-xs font-medium text-brand-900/70 ${className}`}>
      <span className="mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-normal text-brand-900/40">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputCls} {...props} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={inputCls} rows={3} {...props} />;
}
export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={inputCls} {...props}>{children}</select>;
}

type Tone = "slate" | "green" | "red" | "amber" | "blue" | "pink" | "violet" | "gold";
export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) {
  const t: Record<Tone, string> = {
    slate: "bg-brand-50 text-brand-800 ring-brand-200", green: "bg-emerald-100/70 text-emerald-800 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25", red: "bg-red-100/70 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/25",
    amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25", blue: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/25", pink: "bg-rose-50 text-rose-700 ring-rose-200",
    violet: "bg-brand-100 text-brand-800 ring-brand-300", gold: "bg-gold-50 text-gold-700 ring-gold-300",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${t[tone]}`}>{children}</span>;
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead><tr className="border-b border-brand-100 text-[11px] uppercase tracking-wider text-brand-900/45">{head.map((h) => <th key={h} className="whitespace-nowrap px-2 py-2.5 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-brand-50 [&>tr:hover]:bg-ivory-100/70">{children}</tbody>
      </table>
      {!hasRows && <Empty>{empty ?? "Nothing here yet."}</Empty>}
    </div>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-2 py-2.5 align-top ${className}`}>{children}</td>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="my-2 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-brand-200 bg-ivory-50 px-4 py-8 text-center">
      <span className="grid h-10 w-10 animate-float place-items-center rounded-full bg-champagne text-gold-600" aria-hidden><Sparkles className="h-5 w-5 animate-twinkle" /></span>
      <p className="max-w-md text-sm text-brand-900/55">{children}</p>
    </div>
  );
}

export function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (!msg && !error) return null;
  return (
    <div role="status" className={`mb-5 flex animate-slide-in-right items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${error ? "border-red-200 bg-red-50 text-red-800 dark:border-red-400/30 dark:bg-red-950/60 dark:text-red-200" : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-950/60 dark:text-emerald-200"}`}>
      {error ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <span>{error ?? msg}</span>
    </div>
  );
}

export const statusTone = (s: string) =>
  (({ booked: "blue", confirmed: "violet", completed: "green", no_show: "red", cancelled: "slate", draft: "amber", negotiating: "violet", approved: "blue", received: "green",
    shortlisted: "green", rejected: "red", screening: "amber", new: "blue", hired: "violet", sent: "green", simulated: "amber", failed: "red", received_msg: "blue" }) as Record<string, Tone>)[s] ?? "slate";
