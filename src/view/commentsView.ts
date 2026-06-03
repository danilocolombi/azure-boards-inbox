import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { AzureClient, isUnauthorized } from '../azure/client';
import { addComment, resolveCommentHtml } from '../azure/comments';
import { getWorkItemDetails } from '../azure/workItems';
import { isAiAvailable, polishDraft } from '../commands/polish';
import { getCommentsEnabled } from '../state/config';
import { markdownToCommentHtml } from '../util/markdown';
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
  private current: { id: number; projectName: string } | undefined;
  private aiAvailable: boolean | undefined;

  constructor(
    private readonly client: AzureClient,
    private readonly auth: AuthService
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = renderHtml(webviewView.webview);
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'submitComment') void this.handleSubmit(String(msg.text ?? ''), Number(msg.id));
      else if (msg.type === 'polish') void this.handlePolish(String(msg.text ?? ''));
      else if (msg.type === 'previewRequest') this.handlePreview(String(msg.text ?? ''));
      else if (msg.type === 'enableComments')
        void vscode.commands.executeCommand('azureBoards.enableComments');
    });
    // Re-send the last state when the view becomes visible again.
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.postCapabilities();
        this.postState(this.lastState);
      }
    });
    void this.postCapabilities();
    this.postState(this.lastState);
  }

  clear(): void {
    this.requestId++;
    this.current = undefined;
    this.setState({ kind: 'empty' });
  }

  /** Re-evaluate composer availability (e.g. after the user enables commenting). */
  refreshComposer(): void {
    void this.postCapabilities();
    this.postState(this.lastState);
  }

  async showFor(node: WorkItemNode): Promise<void> {
    const id = ++this.requestId;
    this.current = { id: node.workItem.id, projectName: node.projectName };
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
      const comments: CommentDto[] = await Promise.all(
        d.comments.map(async (c) => ({
          author: c.author,
          dateLabel: relativeDate(c.createdDate),
          body: await resolveCommentHtml(this.client, node.projectName, c.text)
        }))
      );
      if (id !== this.requestId) return;
      this.setState({ kind: 'loaded', header, comments });
    } catch (err) {
      if (id !== this.requestId) return;
      const message = err instanceof Error ? err.message : String(err);
      this.setState({ kind: 'error', header, message });
    }
  }

  private async handleSubmit(text: string, id: number): Promise<void> {
    const cur = this.current;
    const trimmed = text.trim();
    if (!cur || cur.id !== id || !trimmed || !getCommentsEnabled()) return;
    try {
      const html = markdownToCommentHtml(trimmed);
      const comment = await addComment(this.client, cur.projectName, cur.id, html);
      if (this.lastState.kind === 'loaded' && this.lastState.header.id === cur.id) {
        const dto: CommentDto = {
          author: comment.author,
          dateLabel: relativeDate(comment.createdDate),
          body: await resolveCommentHtml(this.client, cur.projectName, comment.text) || trimmed
        };
        this.setState({
          kind: 'loaded',
          header: this.lastState.header,
          comments: [...this.lastState.comments, dto]
        });
      }
      this.post({ type: 'composerReset' });
    } catch (err) {
      if (isUnauthorized(err)) {
        this.post({ type: 'composerError', message: 'Your PAT lacks write access.' });
        void this.promptUpdateToken();
      } else {
        const message = err instanceof Error ? err.message : String(err);
        this.post({ type: 'composerError', message });
      }
    }
  }

  private async handlePolish(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const result = await polishDraft(trimmed);
      if (result === undefined) {
        this.post({ type: 'composerError', message: 'No AI model is available.' });
        this.aiAvailable = false;
        void this.postCapabilities();
        return;
      }
      this.post({ type: 'polishResult', text: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post({ type: 'composerError', message });
    }
  }

  private handlePreview(text: string): void {
    const html = text.trim() ? markdownToCommentHtml(text) : '';
    this.post({ type: 'preview', html });
  }

  private async promptUpdateToken(): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      'Adding comments needs a Personal Access Token with Work Items (Read & Write).',
      'Update Token'
    );
    if (choice !== 'Update Token') return;
    if (await this.auth.promptWritePat()) this.client.invalidate();
  }

  private async postCapabilities(): Promise<void> {
    if (this.aiAvailable === undefined) this.aiAvailable = await isAiAvailable();
    this.post({
      type: 'capabilities',
      canComment: getCommentsEnabled(),
      canPolish: this.aiAvailable
    });
  }

  private setState(state: State): void {
    this.lastState = state;
    this.postState(state);
  }

  private postState(state: State): void {
    this.post({ type: 'state', state });
  }

  private post(message: unknown): void {
    this.view?.webview.postMessage(message);
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
  const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}';`;
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
  .comment { padding: 8px 10px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25)); border-radius: 6px; background: var(--vscode-textBlockQuote-background, transparent); }
  .comment + .comment { margin-top: 8px; }
  .comment .meta-row { display: flex; align-items: baseline; }
  .comment .who { font-weight: 600; }
  .comment .when { color: var(--vscode-descriptionForeground); margin-left: 6px; font-size: 0.85em; }
  .comment .body { margin-top: 6px; word-break: break-word; }
  .comment .body > *:first-child { margin-top: 0; }
  .comment .body > *:last-child { margin-bottom: 0; }
  .comment .body p { margin: 0 0 6px; }
  .comment .body ul, .comment .body ol { margin: 0 0 6px; padding-left: 20px; }
  .comment .body img { max-width: 100%; height: auto; border-radius: 4px; display: block; margin: 6px 0; }
  .comment .body a { color: var(--vscode-textLink-foreground); }
  .comment .body code { font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15)); padding: 0 3px; border-radius: 3px; }
  .comment .body pre { background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15)); padding: 6px 8px; border-radius: 4px; overflow-x: auto; }
  .comment .body pre code { background: none; padding: 0; }
  .img-fallback { color: var(--vscode-descriptionForeground); font-style: italic; }
  .error { color: var(--vscode-errorForeground); }
  #enablePrompt { margin-top: 14px; border-top: 1px solid var(--vscode-panel-border, transparent); padding-top: 10px; color: var(--vscode-descriptionForeground); }
  #enablePrompt button { margin-top: 6px; border: none; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-size: var(--vscode-font-size); background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  #enablePrompt button:hover { background: var(--vscode-button-hoverBackground); }
  #composer { margin-top: 14px; border-top: 1px solid var(--vscode-panel-border, transparent); padding-top: 10px; }
  .toolbar { display: flex; gap: 2px; margin-bottom: 4px; }
  .toolbar button { background: transparent; color: var(--vscode-foreground); border: 1px solid transparent; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 0.9em; min-width: 26px; }
  .toolbar button:hover { background: var(--vscode-toolbar-hoverBackground); }
  #draft { width: 100%; box-sizing: border-box; resize: none; overflow-y: auto; min-height: 120px; max-height: 360px; line-height: 1.45; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-contrastBorder, transparent)); border-radius: 4px; padding: 6px 8px; }
  #draft:focus { outline: 1px solid var(--vscode-focusBorder); }
  #previewLabel { margin-top: 8px; }
  #preview { margin-top: 4px; padding: 6px 8px; border: 1px dashed var(--vscode-panel-border, rgba(128,128,128,0.35)); border-radius: 4px; word-break: break-word; }
  #preview > *:first-child { margin-top: 0; }
  #preview > *:last-child { margin-bottom: 0; }
  #preview p { margin: 0 0 6px; }
  #preview ul, #preview ol { margin: 0 0 6px; padding-left: 20px; }
  #preview h1, #preview h2, #preview h3 { margin: 8px 0 4px; font-size: 1.05em; }
  #preview code { font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15)); padding: 0 3px; border-radius: 3px; }
  #preview pre { background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15)); padding: 6px 8px; border-radius: 4px; overflow-x: auto; }
  #preview pre code { background: none; padding: 0; }
  #preview a { color: var(--vscode-textLink-foreground); }
  .composer-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 8px; }
  .composer-actions button { border: none; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-size: var(--vscode-font-size); }
  .composer-actions button:disabled { opacity: 0.5; cursor: default; }
  .composer-actions button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .composer-actions button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  .composer-actions button.ghost { background: transparent; color: var(--vscode-descriptionForeground); border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, rgba(128,128,128,0.35))); display: inline-flex; align-items: center; gap: 5px; }
  .composer-actions button.ghost:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-foreground); }
  .composer-actions .spacer { flex: 1; }
  #composer-msg { margin-top: 6px; font-size: 0.9em; }
  .hint { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-top: 4px; }
</style>
</head>
<body>
<div id="root"><div class="empty">Select a work item to see its comments.</div></div>
<div id="enablePrompt" hidden>
  <div>Adding comments is off. It needs a token with Work Items (Read &amp; Write).</div>
  <button id="enableBtn">Enable adding comments</button>
</div>
<div id="composer" hidden>
  <div class="toolbar">
    <button data-md="bold" title="Bold"><b>B</b></button>
    <button data-md="italic" title="Italic"><i>I</i></button>
    <button data-md="code" title="Inline code">&lt;/&gt;</button>
    <button data-md="ul" title="Bulleted list">&#8226;</button>
    <button data-md="ol" title="Numbered list">1.</button>
    <button data-md="link" title="Link">&#128279;</button>
  </div>
  <textarea id="draft" rows="6" placeholder="Write a comment… Markdown supported."></textarea>
  <div id="previewLabel" class="hint" hidden>Preview</div>
  <div id="preview" hidden></div>
  <div class="composer-actions">
    <button id="polishBtn" class="ghost" title="Rewrite your draft using your own configured AI model" hidden><span>&#10024;</span> Polish</button>
    <span class="spacer"></span>
    <button id="commentBtn" class="primary">Comment</button>
  </div>
  <div class="hint">Ctrl/Cmd+Enter to comment.</div>
  <div id="composer-msg" class="error" hidden></div>
</div>
<script nonce="${n}">
  const TICK = '\\u0060';
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  const composer = document.getElementById('composer');
  const enablePrompt = document.getElementById('enablePrompt');
  const enableBtn = document.getElementById('enableBtn');
  const draft = document.getElementById('draft');
  const preview = document.getElementById('preview');
  const previewLabel = document.getElementById('previewLabel');
  const commentBtn = document.getElementById('commentBtn');
  const polishBtn = document.getElementById('polishBtn');
  const msgEl = document.getElementById('composer-msg');
  let previewTimer = null;

  let caps = { canComment: false, canPolish: false };
  let stateLoaded = false;
  let currentId = null;
  let busy = false;

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
      + '<div class="meta-row"><span class="who">' + escapeHtml(c.author) + '</span><span class="when">' + escapeHtml(c.dateLabel) + '</span></div>'
      + '<div class="body">' + c.body + '</div>'
      + '</div>'
    ).join('');
  }
  function updateComposer() {
    composer.hidden = !(stateLoaded && caps.canComment);
    enablePrompt.hidden = !(stateLoaded && !caps.canComment);
    polishBtn.hidden = !caps.canPolish;
  }
  function setMsg(text, isError) {
    if (!text) { msgEl.hidden = true; msgEl.textContent = ''; return; }
    msgEl.hidden = false;
    msgEl.textContent = text;
    msgEl.className = isError ? 'error' : 'muted';
  }
  function setBusy(b) {
    busy = b;
    commentBtn.disabled = b;
    polishBtn.disabled = b;
  }
  function render(state) {
    if (state.kind === 'empty') {
      root.innerHTML = '<div class="empty">Select a work item to see its comments.</div>';
      stateLoaded = false; currentId = null;
    } else if (state.kind === 'loading') {
      root.innerHTML = renderHeader(state.header) + '<div class="muted">Loading…</div>';
      stateLoaded = false;
    } else if (state.kind === 'loaded') {
      root.innerHTML = renderHeader(state.header) + renderComments(state.comments);
      stateLoaded = true;
      if (currentId !== state.header.id) {
        currentId = state.header.id;
        clearDraft();
        setMsg('');
      }
    } else if (state.kind === 'error') {
      root.innerHTML = renderHeader(state.header) + '<div class="error">' + escapeHtml(state.message) + '</div>';
      stateLoaded = false;
    }
    updateComposer();
  }

  function autoGrow() {
    draft.style.height = 'auto';
    draft.style.height = Math.min(draft.scrollHeight + 2, 360) + 'px';
  }
  function schedulePreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const t = draft.value;
      if (!t.trim()) { preview.hidden = true; previewLabel.hidden = true; preview.innerHTML = ''; return; }
      vscode.postMessage({ type: 'previewRequest', text: t });
    }, 250);
  }
  function clearDraft() {
    draft.value = '';
    draft.style.height = '';
    preview.hidden = true; previewLabel.hidden = true; preview.innerHTML = '';
  }
  // execCommand('insertText') keeps the native undo/redo stack intact, unlike
  // assigning draft.value directly (which is why Ctrl+Z used to do nothing).
  function insertAt(start, end, text, selStart, selEnd) {
    draft.focus();
    draft.setSelectionRange(start, end);
    if (!document.execCommand('insertText', false, text)) {
      draft.setRangeText(text, start, end, 'end');
    }
    if (selStart != null) draft.setSelectionRange(selStart, selEnd == null ? selStart : selEnd);
    autoGrow();
    schedulePreview();
  }
  function surround(before, after, placeholder) {
    const start = draft.selectionStart, end = draft.selectionEnd;
    const sel = end > start ? draft.value.slice(start, end) : placeholder;
    const inner = start + before.length;
    insertAt(start, end, before + sel + after, inner, inner + sel.length);
  }
  function prefixLines(makePrefix) {
    const start = draft.selectionStart, end = draft.selectionEnd;
    const sel = end > start ? draft.value.slice(start, end) : 'item';
    const out = sel.split('\\n').map((l, i) => makePrefix(i) + l).join('\\n');
    insertAt(start, end, out);
  }
  function applyMd(kind) {
    if (kind === 'bold') surround('**', '**', 'bold');
    else if (kind === 'italic') surround('*', '*', 'italic');
    else if (kind === 'code') surround(TICK, TICK, 'code');
    else if (kind === 'link') surround('[', '](url)', 'text');
    else if (kind === 'ul') prefixLines(() => '- ');
    else if (kind === 'ol') prefixLines((i) => (i + 1) + '. ');
  }
  Array.prototype.forEach.call(document.querySelectorAll('.toolbar button'), (b) => {
    b.addEventListener('click', () => applyMd(b.getAttribute('data-md')));
  });

  function submit() {
    if (busy) return;
    const text = draft.value.trim();
    if (!text || currentId == null) return;
    setBusy(true);
    setMsg('Posting…', false);
    vscode.postMessage({ type: 'submitComment', text: draft.value, id: currentId });
  }
  function polish() {
    if (busy) return;
    const text = draft.value.trim();
    if (!text) return;
    setBusy(true);
    setMsg('Polishing with your AI model…', false);
    vscode.postMessage({ type: 'polish', text: draft.value });
  }
  commentBtn.addEventListener('click', submit);
  polishBtn.addEventListener('click', polish);
  enableBtn.addEventListener('click', () => vscode.postMessage({ type: 'enableComments' }));
  draft.addEventListener('input', () => { autoGrow(); schedulePreview(); });
  draft.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m) return;
    if (m.type === 'state') {
      render(m.state);
    } else if (m.type === 'capabilities') {
      caps = { canComment: !!m.canComment, canPolish: !!m.canPolish };
      updateComposer();
    } else if (m.type === 'composerReset') {
      clearDraft();
      setBusy(false);
      setMsg('');
    } else if (m.type === 'composerError') {
      setBusy(false);
      setMsg(m.message || 'Something went wrong.', true);
    } else if (m.type === 'preview') {
      if (m.html) { preview.innerHTML = m.html; preview.hidden = false; previewLabel.hidden = false; }
      else { preview.hidden = true; previewLabel.hidden = true; preview.innerHTML = ''; }
    } else if (m.type === 'polishResult') {
      // Replace the whole draft undoably (select-all then insert).
      draft.focus();
      draft.setSelectionRange(0, draft.value.length);
      if (!document.execCommand('insertText', false, m.text)) draft.value = m.text;
      autoGrow();
      schedulePreview();
      setBusy(false);
      setMsg('Polished — review and post.', false);
    }
  });
</script>
</body>
</html>`;
}
