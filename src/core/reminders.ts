/**
 * Calendar reminders for coming back. Spaced retrieval works because the gaps
 * grow; a calendar file puts those gaps where people already look, with no
 * account, no server and no notification permission.
 *
 * buildReminders() writes an iCalendar (RFC 5545) file with one short event per
 * review, each linking back to the palace.
 */

/** Days after today for the first three walks: the gaps widen, as in the scheduler. */
export const REVIEW_GAPS_DAYS = [1, 3, 7] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC timestamp in iCalendar's basic format, e.g. 20261118T033000Z. */
export function icsTime(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Escape text for an iCalendar property value. */
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold a content line to 75 octets, as the spec asks (continuation lines start with a space). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

/**
 * The review times: the same time of day as `from`, `gap` days later, never
 * between 22:00 and 07:00 local (moved to 09:00 that day).
 */
export function reviewTimes(from: Date, gaps: readonly number[] = REVIEW_GAPS_DAYS): Date[] {
  return gaps.map((g) => {
    const d = new Date(from.getTime());
    d.setDate(d.getDate() + g);
    d.setSeconds(0, 0);
    const h = d.getHours();
    if (h >= 22 || h < 7) d.setHours(9, 0, 0, 0);
    return d;
  });
}

export function buildReminders(opts: {
  title: string;
  url: string;
  stages: number;
  from?: Date;
  gaps?: readonly number[];
}): string {
  const from = opts.from ?? new Date();
  const stamp = icsTime(from);
  const times = reviewTimes(from, opts.gaps);
  const slug = opts.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'palace';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Loci//Your room remembers//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  times.forEach((start, i) => {
    const end = new Date(start.getTime() + 10 * 60_000);
    const nth = ['first', 'second', 'third', 'fourth', 'fifth'][i] ?? `${i + 1}th`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:loci-${slug}-${stamp}-${i}@loci`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(start)}`,
      `DTEND:${icsTime(end)}`,
      `SUMMARY:${icsText(`Walk your palace: ${opts.title}`)}`,
      `DESCRIPTION:${icsText(`Your ${nth} review, about ten minutes. Walk the ${opts.stages} stages in order and say each one before you look. Open: ${opts.url}`)}`,
      `URL:${opts.url}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(`Time to walk: ${opts.title}`)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
