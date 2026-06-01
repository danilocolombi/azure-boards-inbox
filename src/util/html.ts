/** Convert Azure DevOps rich-text (HTML) fields to readable plain text. */
export function htmlToText(html: string | undefined, maxLength?: number): string | undefined {
  if (!html) return undefined;
  let text = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return undefined;
  if (maxLength && text.length > maxLength) text = text.slice(0, maxLength).trimEnd() + '…';
  return text;
}
