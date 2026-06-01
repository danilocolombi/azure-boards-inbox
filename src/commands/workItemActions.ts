import * as vscode from 'vscode';
import { WorkItemNode } from '../view/treeItems';

const SECTION = 'azureBoards';
const DEFAULT_PATTERN = '{type}/{id}-{title}';

function slug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function branchNameFor(node: WorkItemNode): string {
  const pattern =
    vscode.workspace.getConfiguration(SECTION).get<string>('branchNamePattern') ?? DEFAULT_PATTERN;
  const tokens: Record<string, string> = {
    id: String(node.workItem.id),
    title: slug(node.workItem.title),
    type: slug(node.workItem.type)
  };
  return pattern.replace(/\{(id|title|type)\}/g, (_, k) => tokens[k] ?? '');
}

export async function openInBrowser(node: WorkItemNode): Promise<void> {
  if (!node?.url) return;
  await vscode.env.openExternal(vscode.Uri.parse(node.url));
}

export async function copyBranchName(node: WorkItemNode): Promise<void> {
  if (!node?.workItem) return;
  const name = branchNameFor(node);
  await vscode.env.clipboard.writeText(name);
  vscode.window.setStatusBarMessage(`Copied branch name: ${name}`, 3000);
}

export async function copyId(node: WorkItemNode): Promise<void> {
  if (!node?.workItem) return;
  const text = `AB#${node.workItem.id}`;
  await vscode.env.clipboard.writeText(text);
  vscode.window.setStatusBarMessage(`Copied ${text}`, 3000);
}

export async function copyUrl(node: WorkItemNode): Promise<void> {
  if (!node?.url) return;
  await vscode.env.clipboard.writeText(node.url);
  vscode.window.setStatusBarMessage('Copied work item URL', 3000);
}
