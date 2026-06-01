import * as vscode from 'vscode';

export const WORK_ITEM_SCHEME = 'azure-boards-wi';

export function workItemUri(projectName: string, id: number, state: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: WORK_ITEM_SCHEME,
    path: `/${encodeURIComponent(projectName)}/${id}`,
    query: `state=${encodeURIComponent(state)}`
  });
}

export class WorkItemDecorationProvider implements vscode.FileDecorationProvider {
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== WORK_ITEM_SCHEME) return undefined;
    const params = new URLSearchParams(uri.query);
    const state = (params.get('state') ?? '').toLowerCase();
    return decorationForState(state);
  }
}

function decorationForState(state: string): vscode.FileDecoration | undefined {
  if (!state) return undefined;
  if (state === 'blocked' || state === 'failed') {
    return { color: new vscode.ThemeColor('charts.red') };
  }
  if (state === 'new' || state === 'proposed' || state === 'to do') {
    return { color: new vscode.ThemeColor('charts.blue') };
  }
  if (
    state === 'active' ||
    state === 'doing' ||
    state === 'in progress' ||
    state === 'committed' ||
    state === 'approved'
  ) {
    return { color: new vscode.ThemeColor('charts.yellow') };
  }
  if (state === 'resolved') {
    return { color: new vscode.ThemeColor('charts.green') };
  }
  if (state === 'closed' || state === 'done' || state === 'completed') {
    return { color: new vscode.ThemeColor('charts.green') };
  }
  if (state === 'removed') {
    return { color: new vscode.ThemeColor('disabledForeground') };
  }
  return undefined;
}
