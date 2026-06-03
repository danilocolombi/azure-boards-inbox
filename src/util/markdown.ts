import { marked } from 'marked';

/**
 * Render a comment draft (Markdown) to the HTML that Azure DevOps stores for
 * comment bodies. `breaks: true` preserves the single line breaks people type.
 *
 * We never render this HTML ourselves — the comments view reads bodies back as
 * plain text via htmlToText, and Azure DevOps sanitizes comment HTML server-side
 * on render — so no client-side sanitizer is needed here.
 */
export function markdownToCommentHtml(markdown: string): string {
  const html = marked.parse(markdown.trim(), { gfm: true, breaks: true, async: false });
  return (html as string).trim();
}
