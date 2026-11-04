/** Timestamps are stored as UTC ISO strings and shown in Beijing time (UTC+8) by the UI. */
export const nowIso = (): string => new Date().toISOString();

export const addMinutes = (iso: string, minutes: number): string =>
  new Date(Date.parse(iso) + minutes * 60_000).toISOString();
