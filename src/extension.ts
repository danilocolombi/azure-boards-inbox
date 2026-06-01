import * as vscode from 'vscode';
import { AuthService } from './auth/authService';
import { AzureClient } from './azure/client';
import { manageSubscriptions } from './commands/subscriptions';
import { copyAsPrompt } from './commands/chat';
import { editPromptTemplate, registerPromptTemplateSync } from './commands/promptTemplate';
import { copyBranchName, copyId, copyUrl, openInBrowser } from './commands/workItemActions';
import {
  getAssignedToMeOnly,
  getAutoRefreshMinutes,
  getCurrentIterationOnly,
  getShowClosed,
  getSubscriptions,
  setAssignedToMeOnly,
  setCurrentIterationOnly,
  setShowClosed
} from './state/config';
import { BoardsTreeProvider } from './view/boardsTreeProvider';
import { CommentsViewProvider } from './view/commentsView';
import { WorkItemDecorationProvider } from './view/decorationProvider';
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

  const commentsProvider = new CommentsViewProvider(client);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('azureBoards.comments', commentsProvider)
  );

  let selectionTimer: NodeJS.Timeout | undefined;
  context.subscriptions.push(
    view.onDidChangeSelection((e) => {
      if (selectionTimer) clearTimeout(selectionTimer);
      const first = e.selection[0];
      selectionTimer = setTimeout(() => {
        if (first instanceof WorkItemNode) void commentsProvider.showFor(first);
        else commentsProvider.clear();
      }, 200);
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
