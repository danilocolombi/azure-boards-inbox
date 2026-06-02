# Changelog

All notable changes to **Azure Boards Inbox** are documented here.

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
