# Azure Boards Inbox

> The Azure DevOps work items on your plate, in VS Code's sidebar — one click away. Skim, triage, act, without leaving the editor.

![Tree view of work items grouped by project](media/screenshots/tree-view.png)

## Why

Switching to a browser to check a sprint board breaks flow. Azure Boards Inbox puts the items that matter — assigned to you, in your projects — one click away. It's a focused read-only companion for developers: skim what's on you, read a thread, copy a branch name, copy a fully-formatted prompt for your AI assistant, and jump to the full work item when you need to.

## Features

- One tree, multiple projects, grouped and counted
- Defaults to *assigned to me*, hides Closed / Done / Resolved / Removed
- Filters: show closed, show all assignees, current iteration only
- Drag-and-drop to reorder project groups
- Azure DevOps type colors (bug red, story blue, feature purple, …)
- Activity-bar badge + status-bar count of items assigned to you
- Native find — focus the list and type, or Ctrl/Cmd+F
- **Comments side-bar view** — select an item, read the thread instantly
- One-click actions: **Copy as Prompt** (for Copilot / Claude Code / any AI), Open in Azure DevOps, Copy Branch Name, Copy ID (`AB#1234`), Copy URL
- Persisted cache — your items appear immediately on startup while a fresh fetch runs

## Quick start

1. Install the extension and click the **Azure Boards** icon in the activity bar.
2. Run **Sign in** from the welcome view.
3. Paste your org URL (e.g. `https://dev.azure.com/contoso`) and a [Personal Access Token](https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate) with **Work Items: Read** and **Project and Team: Read**. The PAT is stored encrypted via VS Code's SecretStorage — never written to settings.
4. Open the **⋯** menu in the Work Items view and choose **Manage Subscriptions** — pick the projects you want to follow.

That's it. Your items are in the sidebar.

## Daily use

### Title bar
Find, Refresh, Show/Hide Closed, Only Mine / All Assignees, Current Iteration / All, Expand/Collapse, plus an overflow menu with Manage Subscriptions and Edit Prompt Template.

### Each item
Inline: **Copy as Prompt**, **Open in Azure DevOps**.
Right-click for the full menu: Copy as Prompt, Open in Azure DevOps, Copy Branch Name, Copy ID (`AB#1234`), Copy URL.

![Per-item actions](media/screenshots/item-actions.png)

### Comments
Click any item. The **Comments** view (below Work Items) shows the thread — author, relative date, body — and refreshes as you change selection.

![Comments view](media/screenshots/comments-view.png)

### Copy as Prompt — built for AI assistants
Copies a formatted markdown block: title, type, description, repro steps, acceptance criteria, recent comments, and a reference link. Paste it into Copilot Chat, Claude Code, or anywhere else.

Customize the format with **Edit Prompt Template** (overflow menu) — opens the template in a real editor with markdown highlighting, save to apply.

![Editing the prompt template](media/screenshots/edit-prompt-template.png)

Available tokens:
- Scalar: `{preamble}` `{id}` `{title}` `{type}` `{state}` `{priority}` `{assignedTo}` `{iteration}` `{tags}` `{parent}` `{link}`
- Section (each carries its own `## heading` and vanishes when empty): `{description}` `{reproSteps}` `{acceptanceCriteria}` `{comments}`

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `azureBoards.organizationUrl` | `""` | Azure DevOps org URL |
| `azureBoards.subscriptions` | `[]` | Subscribed projects (managed via *Manage Subscriptions*) |
| `azureBoards.showClosed` | `false` | Include Closed / Done / Resolved / Removed |
| `azureBoards.assignedToMeOnly` | `true` | Only items assigned to me |
| `azureBoards.currentIterationOnly` | `false` | Only items in the current iteration |
| `azureBoards.autoRefreshMinutes` | `0` | Auto-refresh interval (0 = off) |
| `azureBoards.branchNamePattern` | `{type}/{id}-{title}` | Pattern for *Copy Branch Name* |
| `azureBoards.chatPromptPreamble` | `"Help me with this Azure DevOps work item:"` | Intro line for the prompt |
| `azureBoards.promptTemplate` | *(multiline)* | Template for *Copy as Prompt* — edit via **Edit Prompt Template** |

All commands live under the **Azure Boards** category in the Command Palette.

## Troubleshooting

- **No items showing.** Subscribe to a project (overflow → *Manage Subscriptions*) and check the title-bar filters aren't excluding everything.
- **Sign-in keeps coming back.** PATs expire — re-run *Sign In*.
- **Current iteration filter is empty.** It uses each project's default team. If your sprints live under a different team, this filter won't see them.

## Develop

```sh
npm install
npm run build      # or: npm run watch
# Press F5 in VS Code to launch the Extension Development Host.
```

Regenerate the README screenshots (high-fidelity HTML mockups rendered via headless Chrome):

```sh
npm install --no-save @vscode/codicons
npm run screenshots
# writes media/screenshots/*.png
```

Package and publish manually:

```sh
npx @vscode/vsce package
npx @vscode/vsce publish
```

### Releasing via CI

This repo ships a GitHub Actions workflow at [`.github/workflows/publish.yml`](.github/workflows/publish.yml) that publishes the extension to the Marketplace and attaches the `.vsix` to a GitHub Release.

One-time setup:
1. Add a repository secret **`VSCE_PAT`** (Settings → Secrets and variables → Actions) — an Azure DevOps PAT with **Marketplace > Manage** scope, "All accessible organizations".

To cut a release:

```sh
npm version patch        # bump 0.1.0 → 0.1.1 in package.json and tag v0.1.1
git push --follow-tags   # CI takes over from here
```

The workflow verifies the tag matches `package.json`, builds, packages, publishes to the Marketplace, and creates a GitHub Release with the `.vsix` attached.

## License

MIT — see [LICENSE](LICENSE).
