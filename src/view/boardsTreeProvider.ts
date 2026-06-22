import * as vscode from 'vscode';
import { AzureClient, isUnauthorized } from '../azure/client';
import { countAssignedToMeOpen, fetchWorkItems, WorkItem } from '../azure/workItems';
import {
  getAssignedToMeOnly,
  getCurrentIterationOnly,
  getOrganizationUrl,
  getPinned,
  getShowClosed,
  getSubscriptions,
  isPinned,
  setSubscriptions,
  Subscription
} from '../state/config';
import { MessageNode, Node, PinnedGroupNode, ProjectNode, WorkItemNode } from './treeItems';

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
  private authError = false;

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
    this.setAuthError(false);
    this.cache.clear();
    this.meOpenCounts.clear();
    for (const [projectId, p] of Object.entries(this.persisted)) {
      this.meOpenCounts.set(projectId, p.meCount);
    }
    this._onDidChangeTreeData.fire();
    this._onDidChangeCounts.fire();
  }

  /** Rebuild cached nodes from existing WorkItem data (no refetch). */
  rerender(): void {
    const orgUrl = getOrganizationUrl();
    for (const [projectId, entry] of this.cache) {
      if (!entry.nodes) continue;
      const sub = getSubscriptions().find((s) => s.projectId === projectId);
      const projectName = sub?.projectName ?? entry.nodes[0]?.projectName;
      if (!projectName) continue;
      entry.nodes = entry.nodes.map(
        (n) =>
          new WorkItemNode(projectName, n.workItem, orgUrl, {
            isPinned: isPinned(n.workItem.id, projectId)
          })
      );
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  setSignedIn(value: boolean): void {
    if (this.signedIn === value) return;
    this.signedIn = value;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Mirror the auth-error state into a context key so the `viewsWelcome` panel
   * (with its "Update Access Token" button) renders in place of an empty tree.
   */
  private setAuthError(value: boolean): void {
    if (this.authError === value) return;
    this.authError = value;
    void vscode.commands.executeCommand('setContext', 'azureBoards.authError', value);
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (!element) {
      if (!this.signedIn) return [];
      // Empty root while an auth error is active lets the "Update Access Token"
      // welcome panel render in place of the tree.
      if (this.authError) return [];
      const subs = getSubscriptions();
      if (subs.length === 0) return [];
      const top: Node[] = [];
      const pinnedNodes = this.getPinnedNodes();
      if (pinnedNodes.length > 0) top.push(new PinnedGroupNode(pinnedNodes.length));
      for (const s of subs) {
        top.push(new ProjectNode(s, this.getProjectItemCount(s.projectId)));
      }
      return top;
    }
    if (element instanceof PinnedGroupNode) {
      const nodes = this.getPinnedNodes();
      return nodes.length === 0 ? [new MessageNode('(no pinned items loaded)', 'pinned')] : nodes;
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

  /** Find a loaded WorkItemNode by work item id across all cached projects. */
  findCachedWorkItem(id: number): WorkItemNode | undefined {
    for (const entry of this.cache.values()) {
      if (!entry.nodes) continue;
      const hit = entry.nodes.find((n) => n.workItem.id === id);
      if (hit) return hit;
    }
    return undefined;
  }

  /**
   * Build a WorkItemNode for each pinned entry that has loaded data. Pins
   * whose source project isn't loaded yet are skipped silently.
   */
  private getPinnedNodes(): WorkItemNode[] {
    const orgUrl = getOrganizationUrl();
    const out: WorkItemNode[] = [];
    for (const p of getPinned()) {
      const projectEntry = this.cache.get(p.projectId);
      const live = projectEntry?.nodes?.find((n) => n.workItem.id === p.id);
      if (live) {
        out.push(
          new WorkItemNode(live.projectName, live.workItem, orgUrl, {
            isPinned: true,
            underPinnedGroup: true
          })
        );
        continue;
      }
      const persisted = this.persisted[p.projectId]?.items.find((wi) => wi.id === p.id);
      if (persisted) {
        out.push(
          new WorkItemNode(p.projectName, persisted, orgUrl, {
            isPinned: true,
            underPinnedGroup: true
          })
        );
      }
    }
    return out;
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
      const nodes = persisted.items.map(
        (wi) =>
          new WorkItemNode(sub.projectName, wi, orgUrl, {
            isPinned: isPinned(wi.id, sub.projectId)
          })
      );
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
      const nodes = items.map(
        (wi) =>
          new WorkItemNode(sub.projectName, wi, orgUrl, {
            isPinned: isPinned(wi.id, sub.projectId)
          })
      );
      this.cache.set(sub.projectId, { loading: false, nodes });
      this.meOpenCounts.set(sub.projectId, meCount);
      await this.persist(sub.projectId, items, meCount);
      this._onDidChangeCounts.fire();
    } catch (err) {
      if (isUnauthorized(err)) {
        // Surface a friendly, in-view recovery panel instead of a modal.
        this.setAuthError(true);
      } else {
        const message =
          err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
        this.cache.set(sub.projectId, { loading: false, error: `Error: ${message}` });
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
