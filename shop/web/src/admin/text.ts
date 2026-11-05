/** '125' / '125.5' / '125.50' → 12550 cents; null for anything that isn't a money amount. */
export function yuanToCents(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

export const centsToYuan = (cents: number | null): string =>
  cents === null ? '' : Number.isInteger(cents / 100) ? String(cents / 100) : (cents / 100).toFixed(2);

/** Today's date in Beijing as YYYY-MM-DD. */
export const beijingToday = (): string => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
