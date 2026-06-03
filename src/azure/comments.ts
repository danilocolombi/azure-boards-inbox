import { AzureClient } from './client';

export interface CommentItem {
  id: number;
  author: string;
  createdDate: string;
  text: string;
}

export async function fetchComments(
  client: AzureClient,
  projectName: string,
  workItemId: number,
  limit = 100
): Promise<CommentItem[]> {
  const conn = await client.get();
  const wit = await conn.getWorkItemTrackingApi();
  const list = await wit.getComments(projectName, workItemId, limit);
  const comments = (list.comments ?? []).map((c) => ({
    id: c.id ?? 0,
    author: c.createdBy?.displayName ?? 'Unknown',
    createdDate: toIso(c.createdDate),
    text: c.text ?? ''
  }));
  comments.sort((a, b) => a.createdDate.localeCompare(b.createdDate));
  return comments;
}

/**
 * Post a comment to a work item. `html` is the already-rendered comment body
 * (see markdownToCommentHtml). Requires a PAT with Work Items (Read & Write).
 */
export async function addComment(
  client: AzureClient,
  projectName: string,
  workItemId: number,
  html: string
): Promise<CommentItem> {
  const conn = await client.get();
  const wit = await conn.getWorkItemTrackingApi();
  const c = await wit.addComment({ text: html }, projectName, workItemId);
  return {
    id: c.id ?? 0,
    author: c.createdBy?.displayName ?? 'You',
    createdDate: toIso(c.createdDate),
    text: c.text ?? ''
  };
}

// --- Rich comment rendering (sanitized HTML + inlined images) -------------

const ATTACHMENT_MARKER = /_apis\/wit\/attachments\//i;

/** Strip the handful of constructs the webview CSP doesn't already neutralize. */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href)\s*=\s*("\s*(?:javascript|vbscript):[^"]*"|'\s*(?:javascript|vbscript):[^']*')/gi, '$1="#"');
}

function mimeFromName(name: string | undefined): string {
  const ext = (name ?? '').toLowerCase().match(/\.([a-z0-9]+)(?:$|\?)/)?.[1];
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'bmp': return 'image/bmp';
    case 'svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

const MAX_INLINE_BYTES = 5 * 1024 * 1024;

/**
 * Sanitize comment HTML for safe display in the webview and inline any Azure
 * DevOps attachment images (which are auth-gated and won't load in the webview)
 * as base64 `data:` URIs fetched through the PAT. External images are left as-is
 * (the webview CSP allows `https:`); attachment images that fail to load become a
 * small placeholder rather than a broken-image icon.
 */
export async function resolveCommentHtml(
  client: AzureClient,
  projectName: string,
  html: string | undefined
): Promise<string> {
  if (!html) return '';
  let safe = sanitizeHtml(html);
  if (!ATTACHMENT_MARKER.test(safe)) return safe;

  let wit;
  try {
    const conn = await client.get();
    wit = await conn.getWorkItemTrackingApi();
  } catch {
    return safe;
  }

  for (const tag of safe.match(/<img\b[^>]*>/gi) ?? []) {
    const srcMatch = tag.match(/\ssrc\s*=\s*(["'])(.*?)\1/i);
    const url = srcMatch?.[2];
    if (!url || !ATTACHMENT_MARKER.test(url)) continue; // external image: leave it
    let replacement: string | null = null;
    try {
      const guid = url.match(/attachments\/([0-9a-fA-F-]{36})/)?.[1];
      if (guid) {
        const fileMatch = url.match(/[?&]fileName=([^&"']+)/i);
        const fileName = fileMatch ? decodeURIComponent(fileMatch[1]) : undefined;
        const buf = await streamToBuffer(
          await wit.getAttachmentContent(guid, fileName, projectName, true)
        );
        if (buf.length <= MAX_INLINE_BYTES) {
          const dataUri = `data:${mimeFromName(fileName)};base64,${buf.toString('base64')}`;
          replacement = tag.replace(srcMatch![0], ` src="${dataUri}"`);
        }
      }
    } catch {
      replacement = null;
    }
    safe = safe.replace(tag, replacement ?? '<span class="img-fallback">🖼 image — open in Azure DevOps</span>');
  }
  return safe;
}

function toIso(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}
