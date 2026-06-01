import * as vscode from 'vscode';
import { AzureClient } from '../azure/client';
import { getWorkItemDetails } from '../azure/workItems';
import { htmlToText } from '../util/html';
import { WorkItemNode } from './treeItems';

interface CommentDto {
  author: string;
  dateLabel: string;
  body: string;
}

interface Header {
  id: number;
  title: string;
  type: string;
  url: string;
}

type State =
  | { kind: 'empty' }
  | { kind: 'loading'; header: Header }
  | { kind: 'loaded'; header: Header; comments: CommentDto[] }
  | { kind: 'error'; header: Header; message: string };

export class CommentsViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private requestId = 0;
  private lastState: State = { kind: 'empty' };

  constructor(private readonly client: AzureClient) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = renderHtml(webviewView.webview);
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
    // Re-send the last state when the view becomes visible again.
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this.post(this.lastState);
    });
    this.post(this.lastState);
  }

  clear(): void {
    this.requestId++;
    this.setState({ kind: 'empty' });
  }

  async showFor(node: WorkItemNode): Promise<void> {
    const id = ++this.requestId;
    const header: Header = {
      id: node.workItem.id,
      title: node.workItem.title,
      type: node.workItem.type,
      url: node.url
    };
    this.setState({ kind: 'loading', header });
    try {
      const d = await getWorkItemDetails(this.client, node.workItem.id, node.projectName);
      if (id !== this.requestId) return;
      const comments: CommentDto[] = d.comments.map((c) => ({
        author: c.author,
        dateLabel: relativeDate(c.createdDate),
        body: htmlToText(c.text) ?? ''
      }));
      this.setState({ kind: 'loaded', header, comments });
    } catch (err) {
      if (id !== this.requestId) return;
      const message = err instanceof Error ? err.message : String(err);
      this.setState({ kind: 'error', header, message });
    }
  }

  private setState(state: State): void {
    this.lastState = state;
    this.post(state);
  }

  private post(state: State): void {
    this.view?.webview.postMessage({ type: 'state', state });
  }
}

function relativeDate(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso.slice(0, 10);
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function nonce(): string {
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function renderHtml(webview: vscode.Webview): string {
  const n = nonce();
  const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}';`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 8px 10px; }
  .empty, .muted { color: var(--vscode-descriptionForeground); }
  .header { padding-bottom: 6px; border-bottom: 1px solid var(--vscode-panel-border, transparent); margin-bottom: 8px; }
  .header .title { font-weight: 600; }
  .header .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-top: 2px; }
  .header a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  .header a:hover { text-decoration: underline; }
  .comment { padding: 8px 0; border-top: 1px solid var(--vscode-panel-border, transparent); }
  .comment:first-of-type { border-top: 0; padding-top: 0; }
  .comment .who { font-weight: 600; }
  .comment .when { color: var(--vscode-descriptionForeground); margin-left: 6px; font-size: 0.9em; }
  .comment .body { margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
  .error { color: var(--vscode-errorForeground); }
</style>
</head>
<body>
<div id="root"><div class="empty">Select a work item to see its comments.</div></div>
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function renderHeader(h) {
    return '<div class="header">'
      + '<div class="title">' + escapeHtml(h.type) + ' #' + h.id + ': ' + escapeHtml(h.title) + '</div>'
      + '<div class="meta"><a href="' + escapeHtml(h.url) + '">Open in Azure DevOps</a></div>'
      + '</div>';
  }
  function renderComments(comments) {
    if (comments.length === 0) return '<div class="empty">No comments yet.</div>';
    return comments.map(c =>
      '<div class="comment">'
      + '<div><span class="who">' + escapeHtml(c.author) + '</span><span class="when">' + escapeHtml(c.dateLabel) + '</span></div>'
      + '<div class="body">' + escapeHtml(c.body) + '</div>'
      + '</div>'
    ).join('');
  }
  function render(state) {
    if (state.kind === 'empty') {
      root.innerHTML = '<div class="empty">Select a work item to see its comments.</div>';
    } else if (state.kind === 'loading') {
      root.innerHTML = renderHeader(state.header) + '<div class="muted">Loading…</div>';
    } else if (state.kind === 'loaded') {
      root.innerHTML = renderHeader(state.header) + renderComments(state.comments);
    } else if (state.kind === 'error') {
      root.innerHTML = renderHeader(state.header) + '<div class="error">' + escapeHtml(state.message) + '</div>';
    }
  }
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'state') render(e.data.state);
  });
</script>
</body>
</html>`;
}
