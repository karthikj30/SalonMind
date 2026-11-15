/** Original line-art illustration: salon mirror, chair, scissors and comb (no stock imagery). */
export function SalonArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 360" className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id="mirror" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fbe9e4" /><stop offset="1" stopColor="#f8efd9" /></linearGradient>
        <linearGradient id="seat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7e3f75" /><stop offset="1" stopColor="#b9523a" /></linearGradient>
      </defs>
      {/* arched mirror */}
      <path d="M120 300V120a90 90 0 0 1 180 0v180" fill="url(#mirror)" stroke="#dcb860" strokeWidth="6" />
      <path d="M150 130a60 60 0 0 1 40-55" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity=".8" />
      {/* bulbs */}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => { const a = Math.PI * (i / 6); const cx = 210 - 104 * Math.cos(a), cy = 120 - 104 * Math.sin(a); return <circle key={i} className="animate-twinkle" style={{ animationDelay: `${i * 0.25}s`, transformOrigin: `${cx}px ${cy}px`, transformBox: "view-box" }} cx={cx} cy={cy} r="7" fill="#f8efd9" stroke="#dcb860" strokeWidth="2" />; })}
      {/* chair */}
      <rect x="160" y="210" width="100" height="60" rx="18" fill="url(#seat)" />
      <rect x="150" y="262" width="120" height="22" rx="11" fill="#66325f" />
      <path d="M210 284v34M175 330h70" stroke="#3b1e38" strokeWidth="8" strokeLinecap="round" />
      {/* scissors */}
      <g transform="translate(320 190) rotate(25)" stroke="#c9a043" strokeWidth="5" strokeLinecap="round"><g className="animate-snip" style={{ transformOrigin: "13px 30px" }}>
        <circle cx="0" cy="40" r="11" /><circle cx="26" cy="40" r="11" /><path d="M6 30 34-28M20 30-8-28" />
      </g></g>
      {/* comb */}
      <g transform="translate(40 230) rotate(-18)">
        <rect width="70" height="14" rx="5" fill="#d2aacb" />
        {Array.from({ length: 10 }).map((_, i) => <rect key={i} x={5 + i * 6.5} y="12" width="3" height="16" rx="1.5" fill="#d2aacb" />)}
      </g>
      {/* sparkles */}
      {[[70, 80], [350, 70], [380, 300], [40, 330]].map(([x, y], i) => <path key={i} className="animate-twinkle" style={{ animationDelay: `${i * 0.6}s`, transformOrigin: `${x}px ${y}px`, transformBox: "view-box" }} d={`M${x} ${y - 10}l3 7 7 3-7 3-3 7-3-7-7-3 7-3z`} fill="#dcb860" />)}
    </svg>
  );
}
