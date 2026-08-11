/**
 * Minimal iCalendar (RFC 5545) VEVENT builder — no dependencies. Produces a
 * .ics payload for an interview invite that any calendar app can import.
 */

type IcsEvent = {
  uid: string;
  start: Date;
  durationMinutes: number;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  organizer?: { name: string; email: string };
  attendees?: { name: string; email: string }[];
};

function stamp(d: Date): string {
  // UTC basic format: 20260811T140000Z
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Fold long lines to 75 octets per RFC 5545, continued with a leading space. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let s = line;
  parts.push(s.slice(0, 75));
  s = s.slice(75);
  while (s.length > 74) {
    parts.push(" " + s.slice(0, 74));
    s = s.slice(74);
  }
  if (s) parts.push(" " + s);
  return parts.join("\r\n");
}

export function buildIcs(ev: IcsEvent, now: Date): string {
  const end = new Date(ev.start.getTime() + ev.durationMinutes * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HireLane//Interviews//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(ev.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(ev.title)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
  if (ev.url) lines.push(`URL:${esc(ev.url)}`);
  if (ev.organizer) lines.push(`ORGANIZER;CN=${esc(ev.organizer.name)}:mailto:${ev.organizer.email}`);
  for (const a of ev.attendees ?? []) {
    lines.push(`ATTENDEE;CN=${esc(a.name)};RSVP=TRUE:mailto:${a.email}`);
  }
  lines.push("STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}
