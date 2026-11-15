"use client";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

const V = {
  primary: "bg-rose-gold text-white shadow-soft hover:shadow-lift hover:brightness-110",
  secondary: "border border-brand-200 bg-surface text-brand-800 hover:border-brand-300 hover:bg-brand-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-brand-700 hover:bg-brand-50",
};

export function SubmitButton({ children, variant = "primary", className = "", pendingText }: { children: React.ReactNode; variant?: keyof typeof V; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition active:scale-[.97] disabled:cursor-wait disabled:opacity-70 ${V[variant]} ${className}`}>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
