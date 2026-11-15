/** RFC 5545 calendar feed so stylists can subscribe from Google Calendar / Apple Calendar / Outlook. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildIcs(calName: string, events: { uid: string; start: string; end: string; summary: string; description?: string; location?: string; cancelled?: boolean }[]) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SalonMind//Stylist calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`, "X-WR-TIMEZONE:Asia/Kolkata", "REFRESH-INTERVAL;VALUE=DURATION:PT30M"];
  const now = stamp(new Date());
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@salonmind`, `DTSTAMP:${now}`, `DTSTART:${stamp(new Date(e.start))}`, `DTEND:${stamp(new Date(e.end))}`,
      `SUMMARY:${esc(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    lines.push(`STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  // fold lines > 75 octets (RFC 5545 §3.1)
  return lines.map((l) => (l.length <= 75 ? l : l.match(/.{1,74}/g)!.join("\r\n "))).join("\r\n") + "\r\n";
}
