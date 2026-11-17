import { describe, expect, it } from 'vitest';
import { buildReminders, icsText, icsTime, reviewTimes } from '../src/core/reminders';

describe('calendar reminders', () => {
  const from = new Date(2026, 10, 17, 14, 30, 12); // 17 Nov 2026, 14:30 local

  it('spaces reviews 1, 3 and 7 days out at the same time of day', () => {
    const t = reviewTimes(from);
    expect(t.map((d) => d.getDate())).toEqual([18, 20, 24]);
    expect(t.every((d) => d.getHours() === 14 && d.getMinutes() === 30 && d.getSeconds() === 0)).toBe(true);
  });

  it('moves a late-night review to the morning', () => {
    const t = reviewTimes(new Date(2026, 10, 17, 23, 15));
    expect(t.every((d) => d.getHours() === 9 && d.getMinutes() === 0)).toBe(true);
  });

  it('writes a valid calendar with one event and alarm per review', () => {
    const ics = buildReminders({ title: 'How your heart pumps blood', url: 'https://example.test/#p=abc', stages: 6, from });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(3);
    expect(ics).toContain(`DTSTART:${icsTime(reviewTimes(from)[0])}`);
    // Every physical line fits the 75-octet limit.
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // Unique ids, so importing twice does not merge different reviews.
    const uids = ics.match(/UID:[^\r]+/g)!;
    expect(new Set(uids).size).toBe(3);
  });

  it('escapes commas, semicolons and newlines', () => {
    expect(icsText('a, b; c\nd')).toBe('a\\, b\\; c\\nd');
  });
});
