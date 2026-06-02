import { PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { WorkItemRelation } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { AzureClient } from './client';
import { getOrganizationUrl } from '../state/config';

export type LinkedPullRequestStatus = 'draft' | 'active' | 'completed' | 'abandoned' | 'unknown';

export interface LinkedPullRequest {
  id: number;
  title: string;
  status: LinkedPullRequestStatus;
  repoName: string | undefined;
  sourceBranch: string | undefined;
  targetBranch: string | undefined;
  url: string;
}

/**
 * Resolve pull requests linked to a work item from its `relations` (ArtifactLink
 * entries pointing at `vstfs:///Git/PullRequestId/<encoded>`). Each PR is fetched
 * in parallel via the Git API; failures for individual PRs are dropped silently.
 */
export async function fetchLinkedPullRequests(
  client: AzureClient,
  projectName: string,
  relations: WorkItemRelation[] | undefined
): Promise<LinkedPullRequest[]> {
  if (!relations || relations.length === 0) return [];

  const ids = new Set<number>();
  for (const r of relations) {
    if (r.rel !== 'ArtifactLink' || !r.url) continue;
    const id = parsePullRequestId(r.url);
    if (id !== undefined) ids.add(id);
  }
  if (ids.size === 0) return [];

  const conn = await client.get();
  const git = await conn.getGitApi();
  const orgUrl = getOrganizationUrl();

  const fetched = await Promise.all(
    [...ids].map((id) =>
      git
        .getPullRequestById(id, projectName)
        .then((pr): LinkedPullRequest | undefined => {
          if (!pr || pr.pullRequestId === undefined) return undefined;
          const repoName = pr.repository?.name;
          return {
            id: pr.pullRequestId,
            title: pr.title ?? `Pull Request ${pr.pullRequestId}`,
            status: mapStatus(pr.status, pr.isDraft),
            repoName,
            sourceBranch: stripRefHead(pr.sourceRefName),
            targetBranch: stripRefHead(pr.targetRefName),
            url: repoName
              ? `${orgUrl}/${encodeURIComponent(projectName)}/_git/${encodeURIComponent(repoName)}/pullrequest/${pr.pullRequestId}`
              : `${orgUrl}/${encodeURIComponent(projectName)}/_pullrequest/${pr.pullRequestId}`
          };
        })
        .catch(() => undefined)
    )
  );

  return fetched.filter((p): p is LinkedPullRequest => !!p).sort((a, b) => b.id - a.id);
}

function parsePullRequestId(url: string): number | undefined {
  const m = url.match(/PullRequestId\/(.+)$/);
  if (!m) return undefined;
  const decoded = decodeURIComponent(m[1]);
  const parts = decoded.split('/');
  const last = parts[parts.length - 1];
  const id = Number(last);
  return Number.isFinite(id) ? id : undefined;
}

function mapStatus(status: PullRequestStatus | undefined, isDraft: boolean | undefined): LinkedPullRequestStatus {
  if (isDraft && status === PullRequestStatus.Active) return 'draft';
  switch (status) {
    case PullRequestStatus.Active:
      return 'active';
    case PullRequestStatus.Completed:
      return 'completed';
    case PullRequestStatus.Abandoned:
      return 'abandoned';
    default:
      return 'unknown';
  }
}

function stripRefHead(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  return ref.replace(/^refs\/heads\//, '');
}
