/**
 * No-show probability via a hand-calibrated logistic model (explainable, no training data needed
 * on day one). Features: client's historic no-show rate, first visit, lead time, slot hour,
 * deposit paid, booking channel.
 */
export function noShowRisk(f: {
  pastBookings: number; pastNoShows: number; leadHours: number; hour: number; depositPaid: number; source: string;
}): { risk: number; factors: string[] } {
  const factors: string[] = [];
  let z = -2.0;
  const rate = f.pastBookings ? f.pastNoShows / f.pastBookings : 0;
  if (f.pastBookings === 0) { z += 0.6; factors.push("first-time client"); }
  if (rate > 0) { z += 4 * rate; factors.push(`${Math.round(rate * 100)}% past no-show rate`); }
  if (f.leadHours > 24 * 7) { z += 0.7; factors.push("booked >7 days ahead"); }
  else if (f.leadHours < 3) { z -= 0.5; factors.push("same-day booking"); }
  if (f.hour < 11 || f.hour >= 19) { z += 0.3; factors.push("early/late slot"); }
  if (f.source === "marketplace") { z += 0.4; factors.push("marketplace booking"); }
  if (f.depositPaid > 0) { z -= 1.5; factors.push("deposit paid"); }
  const risk = 1 / (1 + Math.exp(-z));
  return { risk: Math.round(risk * 100) / 100, factors };
}
