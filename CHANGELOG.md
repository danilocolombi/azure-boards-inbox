# Changelog

All notable changes to **Azure Boards Inbox** are documented here.

## 0.4.0

- **Polish with AI now works in Cursor** (and any editor without a built-in language model). Polish still prefers a `vscode.lm` provider (e.g. GitHub Copilot) when present, but otherwise falls back to an **OpenAI-compatible** endpoint you configure. Run *Azure Boards: Set AI API Key* (stored in SecretStorage, separate from your Azure DevOps PAT) and set `azureBoards.ai.baseUrl` + `azureBoards.ai.model`. Works with OpenAI, OpenRouter, Groq, Together, or a local Ollama/LM Studio server. As before, **only your draft is sent** — to your own endpoint, never to the extension author.

## 0.3.0

- **Add comments to work items** — opt-in (`azureBoards.enableComments`, off by default). Run *Enable Adding Comments* to turn on a composer in the Comments view; it prompts for a Personal Access Token with *Work Items: Read & Write* (a superset of the read-only token used otherwise). Default sign-in and all read features stay read-only.
- **Markdown toolbar** in the composer (bold, italic, code, bulleted/numbered list, link); post with **Ctrl/Cmd+Enter**. Drafts are converted to HTML on post via `marked`.
- **Polish with AI** (optional) — rewrites your draft using *your own* configured language model via the editor's Language Model API. Only the draft is sent. The button appears only when a model is available (e.g. GitHub Copilot) and is otherwise hidden, so manual commenting works everywhere, including Cursor.
- Composer niceties: live Markdown **preview**, auto-growing textarea, working **undo/redo** on toolbar actions.
- **Comments now render formatting and images.** Bodies display as sanitized HTML; Azure DevOps attachment images (which require auth) are inlined through your PAT so they actually show. Comment cards are visually separated for readability.
- **Refresh** now also re-fetches the comments and pull requests of the selected work item.
- **Now available in Cursor** (and VSCodium, Windsurf, and other VS Code forks) — releases publish to the Open VSX Registry alongside the VS Code Marketplace.
- Minimum VS Code version raised to 1.90 (Language Model API).

## 0.2.0

- **Pull Requests** side-bar view: every PR linked to the selected item, with status pill (Draft / Active / Merged / Abandoned), title, and `repo · source → target` branches
- **Pin** items to a section at the top of the tree via the per-row pin button
- **Branch-aware status bar**: when your active git branch matches `branchNamePattern`, shows `AB#<id> · <title>` with a click to open
- **Stale hint**: `· Nd` on rows not touched in N days (`azureBoards.staleAfterDays`, default 14, `0` disables)
- **Open Work Item in Browser…** — Command Palette helper that accepts an id, `AB#id`, or any URL
- Comments view focuses on the thread only (PRs moved to their own view)
- README rewrite and refreshed screenshots
- Internal: `getWorkItemDetails` now dedups in-flight requests so both side-bar views share a single fetch

## 0.1.0 — Initial release

- Multi-project Work Items tree, grouped and counted, with drag-and-drop reordering
- Defaults to *assigned to me*; hides Closed / Done / Resolved / Removed
- Filters: show closed, show all assignees, current iteration only
- Activity-bar badge and status-bar count of items assigned to you
- Azure DevOps type colors and state-tinted labels
- Native find (focus the list and type, or Ctrl/Cmd+F)
- Comments side-bar view that follows tree selection
- Per-item actions: Copy as Prompt (for Copilot / Claude Code / any AI), Open in Azure DevOps, Copy Branch Name, Copy ID (`AB#1234`), Copy URL
- Configurable prompt template via *Edit Prompt Template*
- PAT-based sign-in stored encrypted via VS Code SecretStorage
- Persisted cache so items appear instantly on startup
- Optional auto-refresh
