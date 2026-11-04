/**
 * Rich-text fields are stored as HTML. Plain text typed in the admin becomes one <p> per line, and
 * HTML of only such paragraphs turns back into plain lines for editing, so the owner never sees tags
 * unless the content really uses HTML.
 */
const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const unescapeHtml = (text: string) =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

export const looksLikeHtml = (text: string): boolean => /<[a-z][^>]*>/i.test(text);

export function textToHtml(text: string): string {
  if (looksLikeHtml(text)) return text.trim();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

export function htmlToEditable(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return '';
  if (/^(\s*<p>[^<>]*<\/p>\s*)+$/.test(trimmed)) {
    return (trimmed.match(/<p>([^<>]*)<\/p>/g) ?? []).map((p) => unescapeHtml(p.slice(3, -4))).join('\n');
  }
  return trimmed;
}

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
