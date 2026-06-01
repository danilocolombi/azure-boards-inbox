import { TeamContext } from 'azure-devops-node-api/interfaces/CoreInterfaces';
import { AzureClient } from './client';

const teamContextCache = new Map<string, TeamContext | null>();

async function resolveTeamContext(
  client: AzureClient,
  projectName: string
): Promise<TeamContext | null> {
  const cached = teamContextCache.get(projectName);
  if (cached !== undefined) return cached;

  const conn = await client.get();
  const core = await conn.getCoreApi();
  const project = await core.getProject(projectName);
  const ctx: TeamContext | null =
    project?.id && project.defaultTeam?.id
      ? { project: project.name, projectId: project.id, team: project.defaultTeam.name, teamId: project.defaultTeam.id }
      : null;
  teamContextCache.set(projectName, ctx);
  return ctx;
}

/** Path of the team's current iteration, e.g. `Contoso\\Sprint 27`, or undefined if unavailable. */
export async function getCurrentIterationPath(
  client: AzureClient,
  projectName: string
): Promise<string | undefined> {
  const ctx = await resolveTeamContext(client, projectName);
  if (!ctx) return undefined;
  const conn = await client.get();
  const work = await conn.getWorkApi();
  const iterations = await work.getTeamIterations(ctx, 'current');
  return iterations?.[0]?.path || undefined;
}
