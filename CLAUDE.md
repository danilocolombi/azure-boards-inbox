# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code extension (**Azure Boards Inbox**, id `danilocolombi.azure-boards-inbox`) that surfaces Azure DevOps work items in the sidebar — multi-project tree, comments side-bar webview, copy-as-prompt for AI assistants. Read-only viewer; never adds write APIs (state transitions, edits, etc.) without explicit scope expansion.

## Commands

- `npm run build` — esbuild bundle (CommonJS, node18 target) → `dist/extension.js`
- `npm run watch` — esbuild context watch (long-lived; for F5 dev loop)
- `npm run compile` — `tsc --noEmit` type-check only
- `npm run lint` — ESLint over `src/`
- `npm run screenshots` — regenerate marketing PNGs (requires `npm install --no-save @vscode/codicons` first; uses headless Chrome)
- `npx @vscode/vsce package` — produce a `.vsix` (runs `vscode:prepublish` → `npm run build`)
- **F5** in VS Code to launch the Extension Development Host with the local extension. There are no automated tests; manual smoke is: Sign In → Manage Subscriptions → confirm tree + counts + comments view + Copy as Prompt.

## Naming conventions you should NOT change

- Extension `displayName` is "Azure Boards Inbox" but the **internal namespace stays `azureBoards.*`** — every command id, context key, setting, view id, and config key uses `azureBoards.*`. Renaming would touch ~100 places for zero user-facing benefit.
- Activity-bar container title stays **"Azure Boards"** (not "Azure Boards Inbox") — it reads better next to view names like "Work Items" / "Comments".

## Architecture

```
src/
  extension.ts            activate(); wires providers, commands, status bar, view selection
  auth/authService.ts     PAT in SecretStorage; promptSignIn() input box flow
  azure/                  Thin wrappers around azure-devops-node-api
    client.ts             Lazy WebApi; isUnauthorized() detects 401/403 + TF error codes
    projects.ts           Paginated listProjects()
    workItems.ts          WIQL builder; fetchWorkItems(); getWorkItemDetails() (includes comments)
    comments.ts           fetchComments() — normalizes createdDate to ISO string at the boundary
    iterations.ts         Resolves *default team's* current iteration (memoized per session)
  state/config.ts         Read/write azureBoards.* settings (Global scope)
  view/
    boardsTreeProvider.ts Tree + DnD; persisted cache + signedIn gate (see below)
    treeItems.ts          ProjectNode, WorkItemNode, MessageNode; type colors + state-tinted icons
    decorationProvider.ts FileDecorationProvider that tints WorkItemNode labels by state
    commentsView.ts       Webview view; updates on tree selection (debounced 200ms)
  commands/
    chat.ts               buildPrompt() + token rendering; DEFAULT_TEMPLATE here
    promptTemplate.ts     Edit-in-editor flow (writes file under globalStorageUri, watches save)
    subscriptions.ts      Manage Subscriptions QuickPick
    workItemActions.ts    Open in Browser, Copy Branch Name / ID / URL
  util/html.ts            htmlToText() — strips Azure DevOps rich-text fields
```

### Non-obvious patterns to preserve

- **Signed-in gate on the tree**: `BoardsTreeProvider.getChildren(root)` returns `[]` when `signedIn` is false. This is intentional — it lets `viewsWelcome` ("Sign in to your Azure DevOps organization…") render in place of an empty tree. Don't return error rows at the root; the welcome view will be hidden.
- **Stale-while-revalidate cache**: First render of a project shows persisted items from `globalState` (key `azureBoards.cache.v1`) while a fresh fetch runs; the fresh result replaces the persisted nodes via `onDidChangeTreeData`. The persisted copy drops `description` to keep `globalState` small — description is repopulated on next live fetch.
- **WIQL + batched fetch**: `fetchWorkItems` runs WIQL for IDs, then `getWorkItems` in chunks of 200 with a fixed `FIELDS` list. Always pass `projectName` as the last arg to `getWorkItems`/`getWorkItem` — the signature is `(id, fields?, asOf?, expand?, project?)` (singular) and `(ids, fields?, asOf?, expand?, errorPolicy?, project?)` (plural).
- **Per-team iteration**: `getCurrentIterationPath` resolves each project's *default team* and queries that team's current sprint. Items under non-default teams are invisible when the filter is on — this is documented in README troubleshooting; don't try to "fix" by querying without team context.
- **Prompt template rendering** (chat.ts `renderTemplate`): line-based. For each template line, all `{tokens}` are substituted; if every token on that line resolves to empty, the **entire line is dropped**. Section tokens (`{description}`, `{reproSteps}`, `{acceptanceCriteria}`, `{comments}`) bake in their own `## heading\n\n` so the whole block appears/disappears atomically. The default template in `DEFAULT_TEMPLATE` (chat.ts) must stay in sync with the `default` string in `package.json`.
- **Comments side-bar webview**: `CommentsViewProvider` re-posts last state on `onDidChangeVisibility` so the view rehydrates when collapsed and re-expanded. Tree selection drives it through a 200ms debounce in `extension.ts`. Comment bodies are sent as plain text (HTML-stripped via `htmlToText`) and rendered with `white-space: pre-wrap`.
- **Expand/Collapse toggle**: `showCollapseAll: false` on the TreeView — the toggle is implemented via the `azureBoards.treeExpanded` context key, updated by both commands and tree expand/collapse events.
- **Decoration colors**: `WorkItemDecorationProvider` colors row labels by state via a fake `azure-boards-wi://...?state=...` URI on `WorkItemNode.resourceUri`. No badge text (we removed it to avoid duplicating the state shown in the description).

### Settings store split

- `azureBoards.*` settings live in user settings (`workspace.getConfiguration`, scope: `application`). Subscriptions, filters, prompt template, etc.
- PAT lives in `SecretStorage` keyed `azureBoards.pat`. **SecretStorage is scoped per extension id** — changing `name` in package.json drops the saved PAT (we hit this when renaming from `azure-boards-viewer` to `azure-boards-inbox`).
- Cache and icon-paths live in `globalState`; also extension-id-scoped.

## Release pipeline

`.github/workflows/publish.yml` triggers on tag push `v*.*.*` (or manual dispatch). It type-checks, builds, packages, verifies tag matches `package.json` version, publishes via `vsce` using the `VSCE_PAT` secret, and creates a GitHub Release with the `.vsix` attached.

To cut a release:

```sh
npm version patch        # bump + tag
git push --follow-tags   # CI publishes
```

The same version cannot be published twice — always bump before re-publishing.

## Important README sections to keep in sync if you change behavior

- Settings table in README.md ↔ package.json `contributes.configuration`
- Commands table in README.md ↔ package.json `contributes.commands`
- Token list in README's "Copy as Prompt" section ↔ tokens built in `chat.ts buildPrompt` and the `markdownDescription` of `azureBoards.promptTemplate` in package.json
- CHANGELOG.md ↔ user-facing changes per version
