import { AzureClient } from './client';

export interface CommentItem {
  id: number;
  author: string;
  createdDate: string;
  text: string;
}

export async function fetchComments(
  client: AzureClient,
  projectName: string,
  workItemId: number,
  limit = 100
): Promise<CommentItem[]> {
  const conn = await client.get();
  const wit = await conn.getWorkItemTrackingApi();
  const list = await wit.getComments(projectName, workItemId, limit);
  const comments = (list.comments ?? []).map((c) => ({
    id: c.id ?? 0,
    author: c.createdBy?.displayName ?? 'Unknown',
    createdDate: toIso(c.createdDate),
    text: c.text ?? ''
  }));
  comments.sort((a, b) => a.createdDate.localeCompare(b.createdDate));
  return comments;
}

function toIso(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}
