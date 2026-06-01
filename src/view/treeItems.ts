import * as vscode from 'vscode';
import { WorkItem } from '../azure/workItems';
import { Subscription } from '../state/config';
import { htmlToText } from '../util/html';
import { workItemUri } from './decorationProvider';

export type Node = ProjectNode | WorkItemNode | MessageNode;

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

export class WorkItemNode extends vscode.TreeItem {
  readonly kind = 'workItem' as const;
  readonly url: string;

  constructor(
    public readonly projectName: string,
    public readonly workItem: WorkItem,
    orgUrl: string
  ) {
    super(`#${workItem.id}  ${workItem.title}`, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'workItem';

    const parts = [workItem.state.toUpperCase()];
    if (workItem.assignedTo) parts.push(workItem.assignedTo);
    else parts.push('Unassigned');
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
    this.id = `wi:${projectName}:${workItem.id}`;
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

