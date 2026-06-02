import * as vscode from 'vscode';
import { getPinned, getSubscriptions, PinnedItem, setPinned } from '../state/config';
import { WorkItemNode } from '../view/treeItems';

function findProjectId(projectName: string): string | undefined {
  return getSubscriptions().find((s) => s.projectName === projectName)?.projectId;
}

export async function pinItem(node: WorkItemNode | undefined): Promise<void> {
  if (!node?.workItem) return;
  const projectId = findProjectId(node.projectName);
  if (!projectId) {
    vscode.window.showWarningMessage('Cannot pin: project is not in your subscriptions.');
    return;
  }
  const current = getPinned();
  if (current.some((p) => p.id === node.workItem.id && p.projectId === projectId)) return;
  const next: PinnedItem[] = [
    ...current,
    { projectId, projectName: node.projectName, id: node.workItem.id }
  ];
  await setPinned(next);
}

export async function unpinItem(node: WorkItemNode | undefined): Promise<void> {
  if (!node?.workItem) return;
  const projectId = findProjectId(node.projectName);
  const current = getPinned();
  const next = current.filter(
    (p) => !(p.id === node.workItem.id && (projectId ? p.projectId === projectId : true))
  );
  if (next.length !== current.length) await setPinned(next);
}
