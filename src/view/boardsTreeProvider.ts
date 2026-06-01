import * as vscode from 'vscode';
import { AzureClient, isUnauthorized } from '../azure/client';
import { countAssignedToMeOpen, fetchWorkItems, WorkItem } from '../azure/workItems';
import {
  getAssignedToMeOnly,
  getCurrentIterationOnly,
  getOrganizationUrl,
  getShowClosed,
  getSubscriptions,
  setSubscriptions,
  Subscription
} from '../state/config';
import { MessageNode, Node, ProjectNode, WorkItemNode } from './treeItems';

const DND_MIME = 'application/vnd.code.tree.azureboardsworkitems';
const CACHE_KEY = 'azureBoards.cache.v1';

interface ProjectCacheEntry {
  loading: boolean;
  error?: string;
  nodes?: WorkItemNode[];
  loadPromise?: Promise<void>;
}

interface PersistedProject {
  items: WorkItem[];
  meCount: number;
}

type PersistedStore = Record<string, PersistedProject>;

export class BoardsTreeProvider
  implements vscode.TreeDataProvider<Node>, vscode.TreeDragAndDropController<Node>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly _onDidChangeCounts = new vscode.EventEmitter<void>();
  readonly onDidChangeCounts = this._onDidChangeCounts.event;

  readonly dragMimeTypes = [DND_MIME];
  readonly dropMimeTypes = [DND_MIME];

  private cache = new Map<string, ProjectCacheEntry>();
  private meOpenCounts = new Map<string, number>();
  private persisted: PersistedStore;
  private signedIn = false;

  constructor(
    private readonly client: AzureClient,
    private readonly memento: vscode.Memento
  ) {
    this.persisted = memento.get<PersistedStore>(CACHE_KEY, {});
    for (const [projectId, p] of Object.entries(this.persisted)) {
      this.meOpenCounts.set(projectId, p.meCount);
    }
  }

  refresh(): void {
    this.cache.clear();
    this.meOpenCounts.clear();
    for (const [projectId, p] of Object.entries(this.persisted)) {
      this.meOpenCounts.set(projectId, p.meCount);
    }
    this._onDidChangeTreeData.fire();
    this._onDidChangeCounts.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  setSignedIn(value: boolean): void {
    if (this.signedIn === value) return;
    this.signedIn = value;
    this._onDidChangeTreeData.fire();
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (!element) {
      if (!this.signedIn) return [];
      const subs = getSubscriptions();
      if (subs.length === 0) return [];
      return subs.map((s) => new ProjectNode(s, this.getProjectItemCount(s.projectId)));
    }
    if (element instanceof ProjectNode) {
      return this.getProjectChildren(element.subscription);
    }
    return [];
  }

  getParent(element: Node): Node | undefined {
    if (element instanceof WorkItemNode) {
      const sub = getSubscriptions().find((s) => s.projectName === element.projectName);
      return sub ? new ProjectNode(sub, this.getProjectItemCount(sub.projectId)) : undefined;
    }
    return undefined;
  }

  getProjectNodes(): ProjectNode[] {
    return getSubscriptions().map((s) => new ProjectNode(s, this.getProjectItemCount(s.projectId)));
  }

  private getProjectItemCount(projectId: string): number | undefined {
    const entry = this.cache.get(projectId);
    if (entry?.nodes) return entry.nodes.length;
    return this.persisted[projectId]?.items.length;
  }

  private async getProjectChildren(sub: Subscription): Promise<Node[]> {
    const entry = this.cache.get(sub.projectId);
    if (entry?.nodes) return this.renderNodes(entry.nodes);
    if (entry?.error) return [new MessageNode(entry.error, 'error')];
    if (entry?.loading) return [new MessageNode('Loading…', 'loading~spin')];

    // No in-memory entry yet: show persisted items immediately (if any) while loading fresh.
    const persisted = this.persisted[sub.projectId];
    const loadPromise = this.loadProject(sub);
    if (persisted) {
      const orgUrl = getOrganizationUrl();
      const nodes = persisted.items.map((wi) => new WorkItemNode(sub.projectName, wi, orgUrl));
      this.cache.set(sub.projectId, { loading: true, nodes, loadPromise });
      return this.renderNodes(nodes);
    }
    return [new MessageNode('Loading…', 'loading~spin')];
  }

  private renderNodes(nodes: WorkItemNode[]): Node[] {
    if (nodes.length === 0) return [new MessageNode('(no items)', 'inbox')];
    return nodes;
  }

  private loadProject(sub: Subscription): Promise<void> {
    const existing = this.cache.get(sub.projectId);
    if (existing?.loadPromise) return existing.loadPromise;

    const promise = this.doLoadProject(sub);
    this.cache.set(sub.projectId, { loading: true, loadPromise: promise });
    return promise;
  }

  private async doLoadProject(sub: Subscription): Promise<void> {
    try {
      const orgUrl = getOrganizationUrl();
      const [items, meCount] = await Promise.all([
        fetchWorkItems(this.client, {
          projectName: sub.projectName,
          assignedToMeOnly: getAssignedToMeOnly(),
          showClosed: getShowClosed(),
          currentIterationOnly: getCurrentIterationOnly()
        }),
        countAssignedToMeOpen(this.client, sub.projectName).catch(() => 0)
      ]);
      const nodes = items.map((wi) => new WorkItemNode(sub.projectName, wi, orgUrl));
      this.cache.set(sub.projectId, { loading: false, nodes });
      this.meOpenCounts.set(sub.projectId, meCount);
      await this.persist(sub.projectId, items, meCount);
      this._onDidChangeCounts.fire();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
      this.cache.set(sub.projectId, { loading: false, error: `Error: ${message}` });
      if (isUnauthorized(err)) {
        const choice = await vscode.window.showErrorMessage(
          'Azure Boards: authentication failed. Sign in again?',
          'Sign In'
        );
        if (choice === 'Sign In') {
          await vscode.commands.executeCommand('azureBoards.signIn');
        }
      }
    } finally {
      this._onDidChangeTreeData.fire();
    }
  }

  getAssignedToMeOpenCount(): number {
    let total = 0;
    for (const n of this.meOpenCounts.values()) total += n;
    return total;
  }

  hasAnyMeCount(): boolean {
    return this.meOpenCounts.size > 0;
  }

  private async persist(projectId: string, items: WorkItem[], meCount: number): Promise<void> {
    // Drop descriptions from the persisted copy to keep globalState small; they
    // are repopulated on the next live fetch.
    const slim = items.map((wi) => ({ ...wi, description: undefined }));
    const subscribedIds = new Set(getSubscriptions().map((s) => s.projectId));
    const next: PersistedStore = { [projectId]: { items: slim, meCount } };
    for (const [id, p] of Object.entries(this.persisted)) {
      if (id !== projectId && subscribedIds.has(id)) next[id] = p;
    }
    this.persisted = next;
    await this.memento.update(CACHE_KEY, next);
  }

  // ---------- Drag and drop ----------

  async handleDrag(source: readonly Node[], data: vscode.DataTransfer): Promise<void> {
    const ids = source
      .filter((n): n is ProjectNode => n instanceof ProjectNode)
      .map((n) => n.subscription.projectId);
    if (ids.length === 0) return;
    data.set(DND_MIME, new vscode.DataTransferItem(JSON.stringify(ids)));
  }

  async handleDrop(target: Node | undefined, data: vscode.DataTransfer): Promise<void> {
    const item = data.get(DND_MIME);
    if (!item) return;
    const raw = await item.asString();
    let draggedIds: string[];
    try {
      draggedIds = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(draggedIds) || draggedIds.length === 0) return;

    const subs = getSubscriptions();
    const draggedSet = new Set(draggedIds);
    const remaining = subs.filter((s) => !draggedSet.has(s.projectId));
    const moving = subs.filter((s) => draggedSet.has(s.projectId));
    if (moving.length === 0) return;

    let insertAt = remaining.length;
    if (target instanceof ProjectNode) {
      const idx = remaining.findIndex((s) => s.projectId === target.subscription.projectId);
      if (idx >= 0) insertAt = idx;
    }
    const reordered = [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
    await setSubscriptions(reordered);
    this._onDidChangeTreeData.fire();
  }
}
