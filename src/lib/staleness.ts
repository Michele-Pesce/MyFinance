/** Working days (Mon-Fri) from `from` (exclusive) to `to` (inclusive). ISO dates. Holidays are ignored: good enough for a warning. */
export function businessDaysBetween(from: string, to: string): number {
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  let n = 0;
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}

/** A price older than 3 working days gets a warning (handoff section 6). */
export const isStale = (priceDate: string, today: string) => businessDaysBetween(priceDate, today) > 3;
