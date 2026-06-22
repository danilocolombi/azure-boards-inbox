import * as vscode from 'vscode';
import { AuthService } from './auth/authService';
import { AzureClient } from './azure/client';
import { manageSubscriptions } from './commands/subscriptions';
import { setAiApiKey } from './commands/ai';
import { enableComments } from './commands/comments';
import { copyAsPrompt } from './commands/chat';
import { openItem } from './commands/openItem';
import { pinItem, unpinItem } from './commands/pin';
import { editPromptTemplate, registerPromptTemplateSync } from './commands/promptTemplate';
import { copyBranchName, copyId, copyUrl, openInBrowser } from './commands/workItemActions';
import { BranchWorkItemWatcher } from './git/branchWatcher';
import {
  getAssignedToMeOnly,
  getAutoRefreshMinutes,
  getCurrentIterationOnly,
  getOrganizationUrl,
  getShowClosed,
  getSubscriptions,
  setAssignedToMeOnly,
  setCurrentIterationOnly,
  setShowClosed
} from './state/config';
import { BoardsTreeProvider } from './view/boardsTreeProvider';
import { CommentsViewProvider } from './view/commentsView';
import { WorkItemDecorationProvider } from './view/decorationProvider';
import { PullRequestsViewProvider } from './view/pullRequestsView';
import { WorkItemNode } from './view/treeItems';

let autoRefreshTimer: NodeJS.Timeout | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const auth = new AuthService(context.secrets);
  const client = new AzureClient(auth);
  const provider = new BoardsTreeProvider(client, context.globalState);

  const view = vscode.window.createTreeView('azureBoards.workItems', {
    treeDataProvider: provider,
    showCollapseAll: false,
    canSelectMany: false,
    dragAndDropController: provider
  });
  context.subscriptions.push(view);

  const setExpandedContext = (expanded: boolean) =>
    vscode.commands.executeCommand('setContext', 'azureBoards.treeExpanded', expanded);
  void setExpandedContext(true);
  context.subscriptions.push(
    view.onDidExpandElement(() => void setExpandedContext(true)),
    view.onDidCollapseElement(() => void setExpandedContext(false))
  );

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(new WorkItemDecorationProvider())
  );

  const commentsProvider = new CommentsViewProvider(client, auth);
  const pullRequestsProvider = new PullRequestsViewProvider(client);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('azureBoards.comments', commentsProvider),
    vscode.window.registerWebviewViewProvider('azureBoards.pullRequests', pullRequestsProvider)
  );

  const showSideViews = (node: unknown) => {
    if (node instanceof WorkItemNode) {
      void commentsProvider.showFor(node);
      void pullRequestsProvider.showFor(node);
    } else {
      commentsProvider.clear();
      pullRequestsProvider.clear();
    }
  };

  let selectionTimer: NodeJS.Timeout | undefined;
  context.subscriptions.push(
    view.onDidChangeSelection((e) => {
      if (selectionTimer) clearTimeout(selectionTimer);
      const first = e.selection[0];
      selectionTimer = setTimeout(() => showSideViews(first), 200);
    })
  );

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'azureBoards.search';
  statusBar.tooltip = 'Open work items assigned to you — click to search';
  context.subscriptions.push(statusBar);

  const updateStatusBar = async () => {
    if (!(await auth.isSignedIn()) || getSubscriptions().length === 0) {
      statusBar.hide();
      view.badge = undefined;
      return;
    }
    const count = provider.getAssignedToMeOpenCount();
    statusBar.text = provider.hasAnyMeCount() ? `$(account) ${count}` : `$(account) …`;
    statusBar.show();
    view.badge = count > 0 ? { value: count, tooltip: `${count} work items assigned to you` } : undefined;
  };
  context.subscriptions.push(provider.onDidChangeCounts(() => void updateStatusBar()));

  // Branch-aware status bar: shows the work item linked to the current branch.
  const branchStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  branchStatus.command = 'azureBoards.openCurrentBranchItem';
  context.subscriptions.push(branchStatus);
  const branchWatcher = new BranchWorkItemWatcher();
  context.subscriptions.push(branchWatcher);

  const updateBranchStatus = () => {
    const id = branchWatcher.current;
    if (!id) {
      branchStatus.hide();
      return;
    }
    const node = provider.findCachedWorkItem(id);
    const title = node?.workItem.title;
    branchStatus.text = title
      ? `$(git-branch) AB#${id} · ${title}`
      : `$(git-branch) AB#${id}`;
    branchStatus.tooltip = title
      ? `${node!.workItem.type} #${id}: ${title}`
      : `Open AB#${id}`;
    branchStatus.show();
  };
  context.subscriptions.push(branchWatcher.onDidChange(updateBranchStatus));
  // Re-evaluate when subscriptions load (we may now have the title in cache).
  context.subscriptions.push(provider.onDidChangeCounts(updateBranchStatus));

  context.subscriptions.push(
    vscode.commands.registerCommand('azureBoards.openCurrentBranchItem', async () => {
      const id = branchWatcher.current;
      if (!id) return;
      const node = provider.findCachedWorkItem(id);
      if (node) {
        try {
          await view.reveal(node, { select: true, focus: true, expand: true });
          return;
        } catch {
          // fall through
        }
      }
      const orgUrl = getOrganizationUrl();
      if (orgUrl) await vscode.env.openExternal(vscode.Uri.parse(`${orgUrl}/_workitems/edit/${id}`));
    })
  );

  const refreshContext = async () => {
    const signedIn = await auth.isSignedIn();
    provider.setSignedIn(signedIn);
    await vscode.commands.executeCommand('setContext', 'azureBoards.signedIn', signedIn);
    await vscode.commands.executeCommand(
      'setContext',
      'azureBoards.noSubscriptions',
      getSubscriptions().length === 0
    );
    await vscode.commands.executeCommand('setContext', 'azureBoards.showClosed', getShowClosed());
    await vscode.commands.executeCommand(
      'setContext',
      'azureBoards.assignedToMeOnly',
      getAssignedToMeOnly()
    );
    await vscode.commands.executeCommand(
      'setContext',
      'azureBoards.currentIterationOnly',
      getCurrentIterationOnly()
    );
    await updateStatusBar();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('azureBoards.signIn', async () => {
      const ok = await auth.promptSignIn();
      if (ok) {
        client.invalidate();
        await refreshContext();
        provider.refresh();
        vscode.window.showInformationMessage('Azure Boards: signed in.');
      }
    }),

    vscode.commands.registerCommand('azureBoards.updateToken', async () => {
      if (await auth.promptUpdatePat()) {
        client.invalidate();
        await refreshContext();
        provider.refresh();
        vscode.window.showInformationMessage('Azure Boards: access token updated.');
      }
    }),

    vscode.commands.registerCommand('azureBoards.signOut', async () => {
      await auth.clearPat();
      client.invalidate();
      await refreshContext();
      provider.refresh();
      vscode.window.showInformationMessage('Azure Boards: signed out.');
    }),

    vscode.commands.registerCommand('azureBoards.refresh', async () => {
      await refreshContext();
      provider.refresh();
      showSideViews(view.selection[0]);
    }),

    vscode.commands.registerCommand('azureBoards.expandAll', async () => {
      for (const node of provider.getProjectNodes()) {
        try {
          await view.reveal(node, { expand: true, select: false, focus: false });
        } catch {
          // ignore nodes that can't be revealed
        }
      }
      await setExpandedContext(true);
    }),
    vscode.commands.registerCommand('azureBoards.collapseAll', async () => {
      await vscode.commands.executeCommand(
        'workbench.actions.treeView.azureBoards.workItems.collapseAll'
      );
      await setExpandedContext(false);
    }),

    vscode.commands.registerCommand('azureBoards.manageSubscriptions', async () => {
      if (!(await auth.isSignedIn())) {
        const choice = await vscode.window.showWarningMessage(
          'Sign in to Azure DevOps first.',
          'Sign In'
        );
        if (choice === 'Sign In') {
          await vscode.commands.executeCommand('azureBoards.signIn');
        }
        return;
      }
      await manageSubscriptions(client);
      await refreshContext();
      provider.refresh();
    }),

    vscode.commands.registerCommand('azureBoards.toggleShowClosed', async () => {
      await setShowClosed(true);
      await refreshContext();
      provider.refresh();
    }),
    vscode.commands.registerCommand('azureBoards.toggleShowClosedOff', async () => {
      await setShowClosed(false);
      await refreshContext();
      provider.refresh();
    }),
    vscode.commands.registerCommand('azureBoards.toggleAssignedToMeOnly', async () => {
      await setAssignedToMeOnly(false);
      await refreshContext();
      provider.refresh();
    }),
    vscode.commands.registerCommand('azureBoards.toggleAssignedToMeOnlyOff', async () => {
      await setAssignedToMeOnly(true);
      await refreshContext();
      provider.refresh();
    }),
    vscode.commands.registerCommand('azureBoards.toggleCurrentIteration', async () => {
      await setCurrentIterationOnly(true);
      await refreshContext();
      provider.refresh();
    }),
    vscode.commands.registerCommand('azureBoards.toggleCurrentIterationOff', async () => {
      await setCurrentIterationOnly(false);
      await refreshContext();
      provider.refresh();
    }),

    vscode.commands.registerCommand('azureBoards.openInBrowser', openInBrowser),
    vscode.commands.registerCommand('azureBoards.copyBranchName', copyBranchName),
    vscode.commands.registerCommand('azureBoards.copyId', copyId),
    vscode.commands.registerCommand('azureBoards.copyUrl', copyUrl),
    vscode.commands.registerCommand('azureBoards.copyAsPrompt', (node) => copyAsPrompt(client, node)),
    vscode.commands.registerCommand('azureBoards.editPromptTemplate', () =>
      editPromptTemplate(context.globalStorageUri)
    ),
    registerPromptTemplateSync(context.globalStorageUri),
    vscode.commands.registerCommand('azureBoards.search', async () => {
      await vscode.commands.executeCommand('azureBoards.workItems.focus');
      await vscode.commands.executeCommand('list.find');
    }),
    vscode.commands.registerCommand('azureBoards.enableComments', async () => {
      if (await enableComments(auth, client)) commentsProvider.refreshComposer();
    }),
    vscode.commands.registerCommand('azureBoards.setAiApiKey', async () => {
      if (await setAiApiKey(auth)) commentsProvider.refreshComposer();
    }),
    vscode.commands.registerCommand('azureBoards.openItem', () => openItem()),
    vscode.commands.registerCommand('azureBoards.pinItem', (node) => pinItem(node)),
    vscode.commands.registerCommand('azureBoards.unpinItem', (node) => unpinItem(node)),

    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration('azureBoards')) return;
      await refreshContext();
      if (e.affectsConfiguration('azureBoards.autoRefreshMinutes')) {
        setupAutoRefresh(provider);
      }
      if (
        e.affectsConfiguration('azureBoards.showClosed') ||
        e.affectsConfiguration('azureBoards.assignedToMeOnly') ||
        e.affectsConfiguration('azureBoards.currentIterationOnly') ||
        e.affectsConfiguration('azureBoards.subscriptions')
      ) {
        provider.refresh();
      }
      if (
        e.affectsConfiguration('azureBoards.pinned') ||
        e.affectsConfiguration('azureBoards.staleAfterDays')
      ) {
        provider.rerender();
      }
      if (e.affectsConfiguration('azureBoards.branchNamePattern')) {
        branchWatcher.refresh();
      }
      if (e.affectsConfiguration('azureBoards.enableComments')) {
        commentsProvider.refreshComposer();
      }
    })
  );

  await refreshContext();
  setupAutoRefresh(provider);
}

function setupAutoRefresh(provider: BoardsTreeProvider): void {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = undefined;
  }
  const minutes = getAutoRefreshMinutes();
  if (minutes <= 0) return;
  autoRefreshTimer = setInterval(() => provider.refresh(), minutes * 60 * 1000);
}

export function deactivate(): void {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
}
