/** Brand mark: gold scissors on a plum tile (same art as the favicon). */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs><linearGradient id="lg-sm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b1e38" /><stop offset="1" stopColor="#94402e" /></linearGradient></defs>
      <rect width="64" height="64" rx="16" fill="url(#lg-sm)" stroke="#dcb860" strokeOpacity=".5" />
      <g fill="none" stroke="#e8cf8f" strokeWidth="3.2" strokeLinecap="round"><circle cx="22" cy="42" r="6" /><circle cx="42" cy="42" r="6" /><path d="M26.5 37.5 44 16M37.5 37.5 20 16" /></g>
    </svg>
  );
}
