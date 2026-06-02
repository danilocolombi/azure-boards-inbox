import * as vscode from 'vscode';
import { WorkItem } from '../azure/workItems';
import { getStaleAfterDays, Subscription } from '../state/config';
import { htmlToText } from '../util/html';
import { workItemUri } from './decorationProvider';

export type Node = ProjectNode | PinnedGroupNode | WorkItemNode | MessageNode;

export class ProjectNode extends vscode.TreeItem {
  readonly kind = 'project' as const;
  constructor(
    public readonly subscription: Subscription,
    count?: number
  ) {
    super(subscription.projectName, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'project';
    this.iconPath = new vscode.ThemeIcon('project');
    this.id = `project:${subscription.projectId}`;
    if (typeof count === 'number') this.description = `${count}`;
  }
}

export class PinnedGroupNode extends vscode.TreeItem {
  readonly kind = 'pinnedGroup' as const;
  constructor(count: number) {
    super('Pinned', vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'pinnedGroup';
    this.iconPath = new vscode.ThemeIcon('pinned');
    this.id = 'pinned';
    this.description = `${count}`;
  }
}

export class WorkItemNode extends vscode.TreeItem {
  readonly kind = 'workItem' as const;
  readonly url: string;

  constructor(
    public readonly projectName: string,
    public readonly workItem: WorkItem,
    orgUrl: string,
    options?: { isPinned?: boolean; underPinnedGroup?: boolean }
  ) {
    super(`#${workItem.id}  ${workItem.title}`, vscode.TreeItemCollapsibleState.None);
    this.contextValue = options?.isPinned ? 'workItem.pinned' : 'workItem';

    const parts = [workItem.state.toUpperCase()];
    if (workItem.assignedTo) parts.push(workItem.assignedTo);
    else parts.push('Unassigned');
    const stale = staleDaysLabel(workItem.changedDate);
    if (stale) parts.push(stale);
    this.description = parts.join('  ·  ');

    this.iconPath = new vscode.ThemeIcon(iconNameForType(workItem.type), colorForType(workItem.type));
    this.resourceUri = workItemUri(projectName, workItem.id, workItem.state);

    const tooltipLines: string[] = [];
    const desc = htmlToText(workItem.description, 600);
    if (desc) tooltipLines.push(desc, '');
    if (workItem.iterationPath) tooltipLines.push(`Iteration: \`${workItem.iterationPath}\``);
    if (tooltipLines.length > 0) {
      this.tooltip = new vscode.MarkdownString(tooltipLines.join('\n'));
    }

    this.url = `${orgUrl}/${encodeURIComponent(projectName)}/_workitems/edit/${workItem.id}`;
    const scope = options?.underPinnedGroup ? 'pinned' : 'project';
    this.id = `wi:${scope}:${projectName}:${workItem.id}`;
    // Intentionally no `command` — click just selects, actions are explicit.
  }
}

export class MessageNode extends vscode.TreeItem {
  readonly kind = 'message' as const;
  constructor(label: string, icon?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'message';
    if (icon) this.iconPath = new vscode.ThemeIcon(icon);
  }
}

function iconNameForType(type: string): string {
  switch (type.toLowerCase()) {
    case 'bug':
      return 'bug';
    case 'task':
      return 'checklist';
    case 'user story':
    case 'product backlog item':
    case 'issue':
      return 'book';
    case 'feature':
      return 'star';
    case 'epic':
      return 'rocket';
    case 'test case':
      return 'beaker';
    default:
      return 'circle-outline';
  }
}

function staleDaysLabel(changedDate: string | undefined): string | undefined {
  const threshold = getStaleAfterDays();
  if (threshold <= 0 || !changedDate) return undefined;
  const t = new Date(changedDate).getTime();
  if (Number.isNaN(t)) return undefined;
  const days = Math.floor((Date.now() - t) / 86400000);
  return days >= threshold ? `${days}d` : undefined;
}

function colorForType(type: string): vscode.ThemeColor | undefined {
  switch (type.toLowerCase()) {
    case 'bug':
      return new vscode.ThemeColor('charts.red');
    case 'epic':
      return new vscode.ThemeColor('charts.orange');
    case 'feature':
      return new vscode.ThemeColor('charts.purple');
    case 'user story':
    case 'product backlog item':
    case 'issue':
      return new vscode.ThemeColor('charts.blue');
    case 'task':
      return new vscode.ThemeColor('charts.yellow');
    case 'test case':
      return new vscode.ThemeColor('charts.green');
    default:
      return undefined;
  }
}

