/*
 * Generate high-fidelity HTML mockups of the extension UI and capture them as PNGs
 * via headless Chrome. Output goes to media/screenshots/.
 *
 * Prerequisites: Google Chrome on PATH (`google-chrome`) and the codicons font.
 * Run from the repo root:
 *   npm install --no-save @vscode/codicons
 *   npm run screenshots
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'media', 'screenshots');
const TMP_DIR = '/tmp/azb-screens';
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

// --- codicon font (base64) -------------------------------------------------
const codiconCss = fs.readFileSync(
  path.join(ROOT, 'node_modules/@vscode/codicons/dist/codicon.css'),
  'utf8'
);
const codiconTtf = fs.readFileSync(
  path.join(ROOT, 'node_modules/@vscode/codicons/dist/codicon.ttf')
);
const codiconFontFace = `
@font-face {
  font-family: "codicon";
  src: url("data:font/truetype;base64,${codiconTtf.toString('base64')}") format("truetype");
}
.codicon { font: normal normal normal 16px/1 codicon; display: inline-block; text-decoration: none; text-rendering: auto; text-align: center; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; user-select: none; vertical-align: middle; }
`;
// Pull just the icon glyph rules from the shipped CSS (.codicon-*:before { content: "\xxxx" })
const glyphRules = codiconCss
  .split('\n')
  .filter((l) => /^\.codicon-[a-z0-9-]+:before/.test(l))
  .join('\n');

// --- shared CSS ------------------------------------------------------------
const BASE_CSS = `
${codiconFontFace}
${glyphRules}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
body {
  background: #1e1e1e;
  color: #cccccc;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, sans-serif;
  font-size: 13px;
}
.frame { display: flex; height: 100vh; }
.activity-bar {
  width: 48px; background: #333333; display: flex; flex-direction: column; align-items: center;
  padding-top: 8px; gap: 4px; border-right: 1px solid #2d2d2d;
}
.activity-bar .item { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; color: #ffffff66; position: relative; }
.activity-bar .item.active { color: #ffffff; box-shadow: inset 2px 0 0 #007acc; }
.activity-bar .item .codicon { font-size: 24px; }
.activity-bar .badge {
  position: absolute; bottom: 6px; right: 6px;
  background: #007acc; color: #ffffff; font-size: 10px; font-weight: 600;
  padding: 1px 4px; border-radius: 8px; line-height: 1.2;
}
.side-bar { width: 360px; background: #252526; display: flex; flex-direction: column; border-right: 1px solid #2d2d2d; }
.view-pane { display: flex; flex-direction: column; min-height: 0; }
.view-pane + .view-pane { border-top: 1px solid #2d2d2d; }
.view-pane > .pane-header {
  display: flex; align-items: center; padding: 4px 12px 4px 16px; height: 22px;
  cursor: default; user-select: none;
}
.view-pane > .pane-header .twisty { color: #cccccc; margin-right: 4px; font-size: 14px; }
.view-pane > .pane-header .title { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #cccccc; flex: 1; }
.view-pane > .pane-header .actions { display: flex; gap: 2px; opacity: 0.75; }
.view-pane > .pane-header .actions .codicon { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; color: #cccccc; }
.view-pane > .pane-header .actions .codicon:hover { background: #ffffff10; border-radius: 3px; }
.tree { flex: 1; overflow: hidden; padding: 2px 0 6px 0; }
.tree .row { display: flex; align-items: center; height: 22px; padding-left: 8px; padding-right: 8px; cursor: default; }
.tree .row:hover { background: #2a2d2e; }
.tree .row.selected { background: #094771; }
.tree .row .twisty { color: #cccccc; width: 16px; font-size: 14px; opacity: 0.8; }
.tree .row .glyph { width: 16px; margin-right: 6px; display: inline-flex; align-items: center; justify-content: center; }
.tree .row .label { color: #cccccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.tree .row .desc { color: #9d9d9d; margin-left: 8px; white-space: nowrap; }
.tree .row.project .label { font-weight: 600; }
.tree .row.project .count { color: #9d9d9d; margin-left: 8px; font-variant-numeric: tabular-nums; }
.tree .row.message { color: #9d9d9d; padding-left: 36px; }
.tree .row.workitem { padding-left: 28px; }
.tree .row.workitem .label .id { color: #9d9d9d; margin-right: 4px; }
.state-active .label, .state-active .desc { color: #d7ba7d; }
.state-new .label, .state-new .desc { color: #75beff; }
.state-blocked .label, .state-blocked .desc { color: #f48771; }
.state-resolved .label, .state-resolved .desc, .state-done .label, .state-done .desc { color: #4ec9b0; }
.type-bug .glyph { color: #f14c4c; }
.type-story .glyph { color: #3794ff; }
.type-task .glyph { color: #cca700; }
.type-feature .glyph { color: #b180d7; }
.type-epic .glyph { color: #d18616; }
.project-glyph { color: #75beff; }
.editor {
  flex: 1; background: #1e1e1e; padding: 28px 32px; color: #d4d4d4; overflow: hidden;
}
.editor-tabs { display: flex; height: 35px; background: #2d2d2d; border-bottom: 1px solid #252526; }
.editor-tabs .tab { padding: 0 16px; display: flex; align-items: center; gap: 8px; background: #1e1e1e; color: #ffffff; border-right: 1px solid #252526; font-size: 13px; }
.editor-tabs .tab .codicon { font-size: 16px; color: #519aba; }
.editor-content { padding: 16px 24px; font-family: "Cascadia Code", "Fira Code", Menlo, Consolas, monospace; font-size: 13px; line-height: 1.5; white-space: pre; }
.md .h1 { color: #569cd6; }
.md .text { color: #d4d4d4; }
.md .punct { color: #c586c0; }
.md .ph { color: #ce9178; }
.status-bar { position: fixed; bottom: 0; left: 0; right: 0; height: 22px; background: #007acc; color: #ffffff; display: flex; align-items: center; padding: 0 8px; font-size: 12px; }
.status-bar .item { display: inline-flex; align-items: center; gap: 4px; padding: 0 8px; height: 100%; }
.status-bar .codicon { font-size: 13px; }

/* Comments view */
.comments-empty { padding: 8px 12px; color: #9d9d9d; }
.comments-header { padding: 8px 12px 6px 12px; border-bottom: 1px solid #3c3c3c; }
.comments-header .ctitle { font-weight: 600; color: #cccccc; }
.comments-header .clink { color: #3794ff; font-size: 12px; margin-top: 2px; display: block; }
.comments-list { padding: 4px 12px 12px 12px; overflow: auto; }
.comment + .comment { border-top: 1px solid #3c3c3c; margin-top: 8px; padding-top: 8px; }
.comment .who { font-weight: 600; color: #cccccc; }
.comment .when { color: #9d9d9d; margin-left: 6px; font-size: 12px; }
.comment .body { margin-top: 4px; white-space: pre-wrap; color: #d4d4d4; }

/* Context menu */
.context-menu {
  position: absolute; background: #252526; border: 1px solid #454545; box-shadow: 0 2px 8px #00000080;
  padding: 4px 0; min-width: 220px; border-radius: 5px; z-index: 100;
}
.context-menu .item {
  display: flex; align-items: center; padding: 4px 12px; gap: 10px; color: #cccccc; font-size: 13px;
}
.context-menu .item:hover { background: #094771; }
.context-menu .item .codicon { color: #cccccc; font-size: 14px; }
.context-menu .sep { height: 1px; background: #3c3c3c; margin: 4px 0; }

/* Pull Requests pane (matches the live webview styling) */
.prs-pane { padding: 8px 12px; overflow: hidden; }
.prs-pane .ph-header { padding-bottom: 6px; border-bottom: 1px solid #3c3c3c; margin-bottom: 8px; }
.prs-pane .ph-title { font-weight: 600; color: #cccccc; }
.prs-pane .ph-link { color: #3794ff; font-size: 0.9em; margin-top: 2px; display: block; }
.pr { padding: 6px 0; }
.pr + .pr { margin-top: 8px; }
.pr-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pr-status { font-size: 0.72em; font-weight: 600; padding: 1px 6px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
.pr-status-active { background: rgba(55,148,255,0.18); color: #3794ff; }
.pr-status-draft { background: rgba(157,157,157,0.18); color: #9d9d9d; }
.pr-status-completed { background: rgba(78,201,176,0.18); color: #4ec9b0; }
.pr-title { color: #cccccc; text-decoration: none; }
.pr-meta { color: #9d9d9d; font-size: 0.9em; margin-top: 2px; }
`;

// --- helpers ---------------------------------------------------------------
function html(body, extraCss = '') {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${BASE_CSS}${extraCss}</style></head>
<body>${body}</body></html>`;
}

const items = {
  bug: (cls = '') => `<i class="codicon codicon-bug type-bug ${cls}"></i>`,
  story: (cls = '') => `<i class="codicon codicon-book type-story ${cls}"></i>`,
  task: (cls = '') => `<i class="codicon codicon-checklist type-task ${cls}"></i>`,
  feature: (cls = '') => `<i class="codicon codicon-star type-feature ${cls}"></i>`
};

function row({ kind = 'workitem', type, state, id, title, assignee, selected = false }) {
  const stateCls = state ? ` state-${state.toLowerCase()}` : '';
  const sel = selected ? ' selected' : '';
  const desc = `${state ? state.toUpperCase() : ''}${assignee ? `  ·  ${assignee}` : ''}`;
  return `
    <div class="row ${kind} type-${type}${stateCls}${sel}">
      <span class="glyph">${items[type]()}</span>
      <span class="label"><span class="id">#${id}</span>${title}</span>
      <span class="desc">${desc}</span>
    </div>`;
}

function projectRow(name, count) {
  return `
    <div class="row project">
      <span class="twisty"><i class="codicon codicon-chevron-down"></i></span>
      <span class="glyph"><i class="codicon codicon-project project-glyph"></i></span>
      <span class="label">${name}</span>
      <span class="count">${count}</span>
    </div>`;
}

function pinnedGroupRow(count) {
  return `
    <div class="row project">
      <span class="twisty"><i class="codicon codicon-chevron-down"></i></span>
      <span class="glyph"><i class="codicon codicon-pinned" style="color:#cca700;"></i></span>
      <span class="label">Pinned</span>
      <span class="count">${count}</span>
    </div>`;
}

function noItems() {
  return `<div class="row message">(no items)</div>`;
}

function activityBar({ badge = 5 } = {}) {
  return `
    <div class="activity-bar">
      <div class="item"><i class="codicon codicon-files"></i></div>
      <div class="item"><i class="codicon codicon-search"></i></div>
      <div class="item"><i class="codicon codicon-source-control"></i></div>
      <div class="item"><i class="codicon codicon-debug-alt"></i></div>
      <div class="item active">
        <i class="codicon codicon-checklist"></i>
        <span class="badge">${badge}</span>
      </div>
      <div class="item"><i class="codicon codicon-extensions"></i></div>
    </div>`;
}

function workItemsHeader() {
  return `
    <div class="pane-header">
      <span class="twisty"><i class="codicon codicon-chevron-down"></i></span>
      <span class="title">Work Items</span>
      <span class="actions">
        <i class="codicon codicon-search" title="Find"></i>
        <i class="codicon codicon-refresh" title="Refresh"></i>
        <i class="codicon codicon-eye" title="Hide Closed"></i>
        <i class="codicon codicon-account" title="Only Mine"></i>
        <i class="codicon codicon-calendar" title="Current Iteration"></i>
        <i class="codicon codicon-collapse-all" title="Collapse All"></i>
        <i class="codicon codicon-ellipsis"></i>
      </span>
    </div>`;
}

function commentsHeader() {
  return `
    <div class="pane-header">
      <span class="twisty"><i class="codicon codicon-chevron-down"></i></span>
      <span class="title">Comments</span>
    </div>`;
}

function statusBar({ withBranchItem = false } = {}) {
  const branchItem = withBranchItem
    ? `<span class="item"><i class="codicon codicon-git-branch"></i>AB#271 · ${SELECTED_TITLE}</span>`
    : '';
  return `
    <div class="status-bar">
      <span class="item"><i class="codicon codicon-source-control"></i>feature/271-login</span>
      <span class="item"><i class="codicon codicon-account"></i>5</span>
      ${branchItem}
      <span style="flex:1"></span>
      <span class="item">Ln 1, Col 1</span>
      <span class="item">Spaces: 2</span>
      <span class="item">UTF-8</span>
    </div>`;
}

const SELECTED_TITLE = 'Login redirect loop on SSO';
const SELECTED_TYPE_LABEL = 'Bug';
const SELECTED_ID = 271;
const SELECTED_URL = 'https://dev.azure.com/contoso/Roadmap/_workitems/edit/271';

function commentsBlockWithThread() {
  return `
    <div class="comments-header">
      <div class="ctitle">${SELECTED_TYPE_LABEL} #${SELECTED_ID}: ${SELECTED_TITLE}</div>
      <a class="clink" href="#">Open in Azure DevOps</a>
    </div>
    <div class="comments-list">
      <div class="comment">
        <div><span class="who">Maria Souza</span><span class="when">2d ago</span></div>
        <div class="body">Repro'd in staging — only happens when the IdP times out. Looks like we're not handling the timeout case at all.</div>
      </div>
      <div class="comment">
        <div><span class="who">Danilo Tavares</span><span class="when">1d ago</span></div>
        <div class="body">Pushing a fix in PR #482, adding a fallback to local auth when the IdP exceeds 5s.</div>
      </div>
      <div class="comment">
        <div><span class="who">Alex Chen</span><span class="when">just now</span></div>
        <div class="body">Verified on staging, looks good. Closing once it ships.</div>
      </div>
    </div>`;
}

function workItemsTree({ selectedId, showPinned = true } = {}) {
  const pinned = showPinned
    ? `${pinnedGroupRow(2)}
       ${row({ type: 'bug', state: 'New', id: 271, title: SELECTED_TITLE, assignee: 'Danilo Tavares', selected: selectedId === 271 })}
       ${row({ type: 'story', state: 'Active', id: 265, title: 'Production Module', assignee: 'Danilo Tavares' })}`
    : '';
  return `
    <div class="tree">
      ${pinned}
      ${projectRow('Roadmap', 5)}
      ${row({ type: 'bug',     state: 'New',    id: 271, title: SELECTED_TITLE, assignee: 'Danilo Tavares' })}
      ${row({ type: 'story',   state: 'Active', id: 265, title: 'Production Module',          assignee: 'Danilo Tavares' })}
      ${row({ type: 'task',    state: 'Active', id: 248, title: 'Migrate logging to OTel',    assignee: 'Alex Chen' })}
      ${row({ type: 'story',   state: 'Active', id: 263, title: 'ERP Replacement',            assignee: 'Maria Souza' })}
      ${row({ type: 'feature', state: 'New',    id: 240, title: 'Reporting overhaul',         assignee: 'Unassigned' })}
      ${projectRow('Platform', 2)}
      ${row({ type: 'bug',     state: 'Active', id: 482, title: 'Cache eviction race',        assignee: 'Alex Chen' })}
      ${row({ type: 'story',   state: 'New',    id: 501, title: 'API rate limits',            assignee: 'Maria Souza' })}
      ${projectRow('Tests', 0)}
      ${noItems()}
    </div>`;
}

function pullRequestsHeader() {
  return `
    <div class="pane-header">
      <span class="twisty"><i class="codicon codicon-chevron-down"></i></span>
      <span class="title">Pull Requests</span>
    </div>`;
}

function pullRequestsBlock() {
  return `
    <div class="prs-pane">
      <div class="ph-header">
        <div class="ph-title">${SELECTED_TYPE_LABEL} #${SELECTED_ID}: ${SELECTED_TITLE}</div>
        <a class="ph-link" href="#">Open in Azure DevOps</a>
      </div>
      <div class="pr">
        <div class="pr-row">
          <span class="pr-status pr-status-active">Active</span>
          <a class="pr-title" href="#">PR #482 — Add fallback to local auth for IdP timeouts</a>
        </div>
        <div class="pr-meta">contoso · feature/271-login → main</div>
      </div>
      <div class="pr">
        <div class="pr-row">
          <span class="pr-status pr-status-draft">Draft</span>
          <a class="pr-title" href="#">PR #488 — Add SSO timeout config</a>
        </div>
        <div class="pr-meta">contoso · feature/271-config → main</div>
      </div>
      <div class="pr">
        <div class="pr-row">
          <span class="pr-status pr-status-completed">Merged</span>
          <a class="pr-title" href="#">PR #470 — Refactor SSO middleware</a>
        </div>
        <div class="pr-meta">contoso · refactor/sso-mw → main</div>
      </div>
    </div>`;
}

// --- scenes ----------------------------------------------------------------

const SCENES = [
  {
    name: 'tree-view',
    size: [1400, 980],
    body: `
      <div class="frame">
        ${activityBar({ badge: 5 })}
        <div class="side-bar">
          <div class="view-pane" style="flex: 1 1 auto;">
            ${workItemsHeader()}
            ${workItemsTree({ selectedId: 271, showPinned: true })}
          </div>
          <div class="view-pane" style="flex: 0 0 230px;">
            ${pullRequestsHeader()}
            ${pullRequestsBlock()}
          </div>
          <div class="view-pane" style="flex: 0 0 280px;">
            ${commentsHeader()}
            ${commentsBlockWithThread()}
          </div>
        </div>
        <div class="editor"></div>
      </div>
      ${statusBar({ withBranchItem: true })}
    `
  },
  {
    name: 'item-actions',
    size: [1200, 720],
    body: `
      <div class="frame">
        ${activityBar({ badge: 5 })}
        <div class="side-bar">
          <div class="view-pane" style="flex: 1 1 auto;">
            ${workItemsHeader()}
            ${workItemsTree({ selectedId: 271, showPinned: false })}
          </div>
        </div>
        <div class="editor"></div>
      </div>
      <div class="context-menu" style="top: 60px; left: 220px;">
        <div class="item"><i class="codicon codicon-pin"></i><span>Pin</span></div>
        <div class="item"><i class="codicon codicon-comment-discussion"></i><span>Copy as Prompt</span></div>
        <div class="item"><i class="codicon codicon-link-external"></i><span>Open in Azure DevOps</span></div>
        <div class="sep"></div>
        <div class="item"><i class="codicon codicon-git-branch"></i><span>Copy Branch Name</span></div>
        <div class="item"><span style="width:14px"></span><span>Copy ID (AB#271)</span></div>
        <div class="item"><span style="width:14px"></span><span>Copy URL</span></div>
      </div>
      ${statusBar()}
    `
  },
  {
    name: 'pull-requests-view',
    size: [1200, 760],
    body: `
      <div class="frame">
        ${activityBar({ badge: 5 })}
        <div class="side-bar">
          <div class="view-pane" style="flex: 0 0 240px;">
            ${workItemsHeader()}
            ${workItemsTree({ selectedId: 271, showPinned: false })}
          </div>
          <div class="view-pane" style="flex: 1 1 auto;">
            ${pullRequestsHeader()}
            ${pullRequestsBlock()}
          </div>
        </div>
        <div class="editor"></div>
      </div>
      ${statusBar({ withBranchItem: true })}
    `
  },
  {
    name: 'comments-view',
    size: [1200, 760],
    body: `
      <div class="frame">
        ${activityBar({ badge: 5 })}
        <div class="side-bar">
          <div class="view-pane" style="flex: 0 0 220px;">
            ${workItemsHeader()}
            ${workItemsTree({ selectedId: 271, showPinned: false })}
          </div>
          <div class="view-pane" style="flex: 1 1 auto;">
            ${commentsHeader()}
            ${commentsBlockWithThread()}
          </div>
        </div>
        <div class="editor"></div>
      </div>
      ${statusBar()}
    `
  },
  {
    name: 'edit-prompt-template',
    size: [1200, 720],
    body: `
      <div class="frame">
        ${activityBar({ badge: 5 })}
        <div class="side-bar">
          <div class="view-pane" style="flex: 1 1 auto;">
            ${workItemsHeader()}
            ${workItemsTree({ selectedId: 271 })}
          </div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column;">
          <div class="editor-tabs">
            <div class="tab"><i class="codicon codicon-markdown"></i>prompt-template.md</div>
          </div>
          <div class="editor-content md">
<span class="ph">{preamble}</span>

<span class="h1"># {type} #{id}: {title}</span>

<span class="ph">{description}</span>

<span class="ph">{reproSteps}</span>

<span class="ph">{acceptanceCriteria}</span>

<span class="ph">{comments}</span>

<span class="text">Reference:</span> <span class="ph">{link}</span>
          </div>
        </div>
      </div>
      ${statusBar()}
    `
  }
];

// --- write and capture -----------------------------------------------------

for (const scene of SCENES) {
  const file = path.join(TMP_DIR, `${scene.name}.html`);
  fs.writeFileSync(file, html(scene.body));
  const out = path.join(OUT_DIR, `${scene.name}.png`);
  const [w, h] = scene.size;
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    `--window-size=${w},${h}`,
    `--screenshot=${out}`,
    `file://${file}`
  ];
  const result = spawnSync('google-chrome', args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
  if (result.status !== 0) {
    console.error('chrome failed for', scene.name, result.stderr?.toString());
    process.exit(1);
  }
  const size = fs.statSync(out).size;
  console.log(`  ${scene.name}.png  ${(size / 1024).toFixed(1)} KB`);
}
console.log('Done. Output in', OUT_DIR);
