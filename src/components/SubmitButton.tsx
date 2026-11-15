"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, variant = "primary", className = "", pendingText }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger" | "ghost"; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  const v = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  return (
    <button type="submit" disabled={pending} className={`inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${v} ${className}`}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
