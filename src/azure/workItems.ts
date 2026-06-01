import { AzureClient } from './client';
import { CommentItem, fetchComments } from './comments';
import { getCurrentIterationPath } from './iterations';

export interface WorkItem {
  id: number;
  title: string;
  state: string;
  type: string;
  assignedTo: string | undefined;
  iterationPath: string | undefined;
  description: string | undefined;
}

export interface WorkItemDetails {
  id: number;
  title: string;
  type: string;
  state: string;
  priority: number | undefined;
  assignedTo: string | undefined;
  iterationPath: string | undefined;
  tags: string | undefined;
  description: string | undefined;
  reproSteps: string | undefined;
  acceptanceCriteria: string | undefined;
  parent: { id: number; title: string | undefined } | undefined;
  comments: CommentItem[];
}

export interface FetchOptions {
  projectName: string;
  assignedToMeOnly: boolean;
  showClosed: boolean;
  currentIterationOnly: boolean;
}

const FIELDS = [
  'System.Id',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.AssignedTo',
  'System.IterationPath',
  'System.Description'
];

function buildWiql(opts: FetchOptions, currentIterationPath: string | undefined): string {
  const where: string[] = [`[System.TeamProject] = @project`];
  if (opts.assignedToMeOnly) where.push(`[System.AssignedTo] = @me`);
  if (!opts.showClosed) where.push(`[System.State] NOT IN ('Closed','Done','Removed','Resolved')`);
  if (currentIterationPath) {
    where.push(`[System.IterationPath] UNDER '${currentIterationPath.replace(/'/g, "''")}'`);
  }
  return `SELECT [System.Id] FROM WorkItems WHERE ${where.join(' AND ')} ORDER BY [System.ChangedDate] DESC`;
}

const DETAIL_FIELDS = [
  'System.Id',
  'System.Title',
  'System.WorkItemType',
  'System.State',
  'System.AssignedTo',
  'System.IterationPath',
  'System.Tags',
  'System.Parent',
  'System.Description',
  'Microsoft.VSTS.Common.Priority',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
  'Microsoft.VSTS.TCM.ReproSteps'
];

function displayName(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw;
  return (raw as { displayName?: string } | undefined)?.displayName;
}

export async function getWorkItemDetails(
  client: AzureClient,
  id: number,
  projectName: string
): Promise<WorkItemDetails> {
  const conn = await client.get();
  const wit = await conn.getWorkItemTrackingApi();
  const [wi, comments] = await Promise.all([
    wit.getWorkItem(id, DETAIL_FIELDS, undefined, undefined, projectName),
    fetchComments(client, projectName, id).catch(() => [] as CommentItem[])
  ]);
  const f = wi.fields ?? {};

  const parentId = f['System.Parent'] as number | undefined;
  let parent: WorkItemDetails['parent'];
  if (parentId) {
    try {
      const p = await wit.getWorkItem(parentId, ['System.Title'], undefined, undefined, projectName);
      parent = { id: parentId, title: p.fields?.['System.Title'] as string | undefined };
    } catch {
      parent = { id: parentId, title: undefined };
    }
  }

  return {
    id: wi.id ?? id,
    title: (f['System.Title'] as string) ?? '',
    type: (f['System.WorkItemType'] as string) ?? '',
    state: (f['System.State'] as string) ?? '',
    priority: f['Microsoft.VSTS.Common.Priority'] as number | undefined,
    assignedTo: displayName(f['System.AssignedTo']),
    iterationPath: f['System.IterationPath'] as string | undefined,
    tags: f['System.Tags'] as string | undefined,
    description: f['System.Description'] as string | undefined,
    reproSteps: f['Microsoft.VSTS.TCM.ReproSteps'] as string | undefined,
    acceptanceCriteria: f['Microsoft.VSTS.Common.AcceptanceCriteria'] as string | undefined,
    parent,
    comments
  };
}

export async function countAssignedToMeOpen(
  client: AzureClient,
  projectName: string
): Promise<number> {
  const conn = await client.get();
  const wit = await conn.getWorkItemTrackingApi();
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.AssignedTo] = @me AND [System.State] NOT IN ('Closed','Done','Removed','Resolved')`;
  const r = await wit.queryByWiql({ query: wiql }, { project: projectName });
  return (r.workItems ?? []).length;
}

export async function fetchWorkItems(client: AzureClient, opts: FetchOptions): Promise<WorkItem[]> {
  const conn = await client.get();
  const wit = await conn.getWorkItemTrackingApi();

  const currentIterationPath = opts.currentIterationOnly
    ? await getCurrentIterationPath(client, opts.projectName)
    : undefined;

  const wiqlResult = await wit.queryByWiql(
    { query: buildWiql(opts, currentIterationPath) },
    { project: opts.projectName }
  );
  const ids = (wiqlResult.workItems ?? []).map((w) => w.id!).filter((id): id is number => typeof id === 'number');
  if (ids.length === 0) return [];

  const items: WorkItem[] = [];
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const batch = await wit.getWorkItems(slice, FIELDS, undefined, undefined, undefined, opts.projectName);
    for (const wi of batch ?? []) {
      const f = wi.fields ?? {};
      const assignedRaw = f['System.AssignedTo'] as { displayName?: string } | string | undefined;
      const assigned =
        typeof assignedRaw === 'string' ? assignedRaw : assignedRaw?.displayName;
      items.push({
        id: wi.id ?? 0,
        title: (f['System.Title'] as string) ?? '(no title)',
        state: (f['System.State'] as string) ?? '',
        type: (f['System.WorkItemType'] as string) ?? '',
        assignedTo: assigned,
        iterationPath: f['System.IterationPath'] as string | undefined,
        description: f['System.Description'] as string | undefined
      });
    }
  }
  const order = new Map(ids.map((id, idx) => [id, idx]));
  items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return items;
}
