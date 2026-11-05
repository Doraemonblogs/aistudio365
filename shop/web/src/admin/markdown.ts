import { Marked } from 'marked';
import TurndownService from 'turndown';

/**
 * Product texts and the shop notice are stored as HTML, which the storefront shows as it always
 * has. The admin edits them as Markdown: stored HTML turns into Markdown when the editor opens, and
 * what the owner types turns back into HTML. A single line break stays a line break, as people
 * expect when typing; a blank line starts a new paragraph.
 */
const marked = new Marked({ gfm: true, breaks: true, async: false });

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  codeBlockStyle: 'fenced',
  br: '',
});

export function markdownToHtml(markdown: string): string {
  return markdown.trim() ? (marked.parse(markdown) as string).trim() : '';
}

export function htmlToMarkdown(html: string): string {
  return html.trim() ? turndown.turndown(html).trim() : '';
}
