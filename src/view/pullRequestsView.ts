import * as vscode from 'vscode';
import { AzureClient } from '../azure/client';
import { getWorkItemDetails } from '../azure/workItems';
import { WorkItemNode } from './treeItems';

interface PullRequestDto {
  id: number;
  title: string;
  status: 'draft' | 'active' | 'completed' | 'abandoned' | 'unknown';
  statusLabel: string;
  repoName: string | undefined;
  sourceBranch: string | undefined;
  targetBranch: string | undefined;
  url: string;
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
  | { kind: 'loaded'; header: Header; pullRequests: PullRequestDto[] }
  | { kind: 'error'; header: Header; message: string };

export class PullRequestsViewProvider implements vscode.WebviewViewProvider {
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
      const pullRequests: PullRequestDto[] = d.pullRequests.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        statusLabel: prStatusLabel(p.status),
        repoName: p.repoName,
        sourceBranch: p.sourceBranch,
        targetBranch: p.targetBranch,
        url: p.url
      }));
      this.setState({ kind: 'loaded', header, pullRequests });
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

function prStatusLabel(status: PullRequestDto['status']): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'active': return 'Active';
    case 'completed': return 'Merged';
    case 'abandoned': return 'Abandoned';
    default: return 'PR';
  }
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
  .pr { padding: 0; }
  .pr + .pr { margin-top: 12px; }
  .pr-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .pr-status { font-size: 0.72em; font-weight: 600; padding: 1px 6px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.04em; flex-shrink: 0; }
  .pr-status-active { background: rgba(55,148,255,0.18); color: #3794ff; }
  .pr-status-draft { background: rgba(157,157,157,0.18); color: var(--vscode-descriptionForeground); }
  .pr-status-completed { background: rgba(78,201,176,0.18); color: #4ec9b0; }
  .pr-status-abandoned { background: rgba(244,135,113,0.18); color: #f48771; }
  .pr-status-unknown { background: rgba(157,157,157,0.18); color: var(--vscode-descriptionForeground); }
  .pr-title { color: var(--vscode-foreground); text-decoration: none; }
  .pr-title:hover { text-decoration: underline; }
  .pr-meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-top: 2px; }
  .error { color: var(--vscode-errorForeground); }
</style>
</head>
<body>
<div id="root"><div class="empty">Select a work item to see its pull requests.</div></div>
<script nonce="${n}">
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
  function renderPRs(prs) {
    if (!prs || prs.length === 0) return '<div class="empty">No linked pull requests.</div>';
    return prs.map(function (p) {
      var meta = [];
      if (p.repoName) meta.push(p.repoName);
      if (p.sourceBranch && p.targetBranch) meta.push(p.sourceBranch + ' → ' + p.targetBranch);
      var metaHtml = meta.length ? '<div class="pr-meta">' + escapeHtml(meta.join(' · ')) + '</div>' : '';
      return '<div class="pr">'
        + '<div class="pr-row">'
        + '<span class="pr-status pr-status-' + escapeHtml(p.status) + '">' + escapeHtml(p.statusLabel) + '</span>'
        + '<a class="pr-title" href="' + escapeHtml(p.url) + '">PR #' + p.id + ' — ' + escapeHtml(p.title) + '</a>'
        + '</div>'
        + metaHtml
        + '</div>';
    }).join('');
  }
  function render(state) {
    if (state.kind === 'empty') {
      root.innerHTML = '<div class="empty">Select a work item to see its pull requests.</div>';
    } else if (state.kind === 'loading') {
      root.innerHTML = renderHeader(state.header) + '<div class="muted">Loading…</div>';
    } else if (state.kind === 'loaded') {
      root.innerHTML = renderHeader(state.header) + renderPRs(state.pullRequests);
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
