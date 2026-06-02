# Azure Boards Inbox

> Your Azure DevOps work items, in VS Code's sidebar.

![Work items, pull requests, and comments in the sidebar](media/screenshots/tree-view.png)

## Features

- **All your items, one tree** — assigned to you across every project, grouped and counted
- **Pin** what you're actively working on to a section at the top
- **Pull Requests** and **Comments** side-bar views that follow your selection
- **Copy as Prompt** — formatted markdown for Copilot / Claude Code / any AI chat (template is editable)
- **Branch-aware status bar** — checkout `bug/1234-fix-login` and the status bar shows `AB#1234 · <title>`
- One-click: copy branch / `AB#1234` / URL, or open in Azure DevOps

## Quick start

1. Click the **Azure Boards** icon in the activity bar → **Sign in**.
2. Paste your org URL and a [Personal Access Token](https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate) (scopes: *Work Items: Read* and *Project and Team: Read*). The PAT is stored encrypted via VS Code's `SecretStorage`.
3. **⋯ → Manage Subscriptions** to pick projects.

That's it.

## Inside

**Per-item actions** — inline: Pin, Copy as Prompt, Open in Azure DevOps. Right-click for Copy Branch Name, Copy ID (`AB#1234`), Copy URL.

![Per-item actions](media/screenshots/item-actions.png)

**Pull Requests** — every PR linked to the selected item, with state pill and `repo · source → target`. Click to open.

![Pull Requests view](media/screenshots/pull-requests-view.png)

**Comments** — the discussion thread, refreshed as you change selection.

![Comments view](media/screenshots/comments-view.png)

**Editable prompt template** — *Edit Prompt Template* (⋯ overflow) opens it in an editor; save to apply.

![Editing the prompt template](media/screenshots/edit-prompt-template.png)

Tokens: `{preamble}` `{id}` `{title}` `{type}` `{state}` `{priority}` `{assignedTo}` `{iteration}` `{tags}` `{parent}` `{link}` `{description}` `{reproSteps}` `{acceptanceCriteria}` `{comments}`. A line whose tokens all resolve empty is dropped.

**Open by ID or URL** — Command Palette → *Azure Boards: Open Work Item in Browser…* → paste anything containing a work-item id.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `azureBoards.organizationUrl` | `""` | Your Azure DevOps org URL |
| `azureBoards.showClosed` | `false` | Include Closed / Done / Resolved / Removed |
| `azureBoards.assignedToMeOnly` | `true` | Only items assigned to me |
| `azureBoards.currentIterationOnly` | `false` | Only items in the current sprint |
| `azureBoards.staleAfterDays` | `14` | Show a `· Nd` hint on items not touched in N days (`0` disables) |
| `azureBoards.autoRefreshMinutes` | `0` | Auto-refresh interval (`0` = off) |
| `azureBoards.branchNamePattern` | `{type}/{id}-{title}` | Used by Copy Branch Name and the branch-aware status bar |
| `azureBoards.chatPromptPreamble` | *(default)* | Lead-in line for the prompt |
| `azureBoards.promptTemplate` | *(multiline)* | Edit via *Edit Prompt Template* |

All commands live under the **Azure Boards** category in the Command Palette.

## Troubleshooting

- **No items showing.** Subscribe to a project (⋯ → *Manage Subscriptions*) and check the title-bar filters.
- **Sign-in keeps coming back.** PAT likely expired — re-run *Sign In*.
- **"Current iteration" filter is empty.** It uses each project's *default team*. Sprints under other teams won't show.

## Develop & release

```sh
npm install
npm run build           # or: npm run watch
npm run screenshots     # regenerate README images (needs @vscode/codicons)
```

Press **F5** in VS Code to launch the Extension Development Host.

Tagged releases (`v*.*.*`) publish to the Marketplace via [`.github/workflows/publish.yml`](.github/workflows/publish.yml). Requires a `VSCE_PAT` repo secret (Azure DevOps PAT, *Marketplace → Manage*).

```sh
npm version patch        # bump + tag
git push --follow-tags   # CI publishes
```

## License

MIT — see [LICENSE](LICENSE).
