/** Mainland China mobile number as 11 digits; accepts spaces, dashes and a +86 / 86 prefix. */
export function normalizePhone(raw: string): string | null {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('86')) digits = digits.slice(2);
  return /^1[3-9]\d{9}$/.test(digits) ? digits : null;
}
