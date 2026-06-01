import * as vscode from 'vscode';
import { AzureClient } from '../azure/client';
import { getWorkItemDetails } from '../azure/workItems';
import { htmlToText } from '../util/html';
import { WorkItemNode } from '../view/treeItems';

const SECTION = 'azureBoards';
const DEFAULT_PREAMBLE = 'Help me with this Azure DevOps work item:';

export const DEFAULT_TEMPLATE = [
  '{preamble}',
  '',
  '# {type} #{id}: {title}',
  '',
  '{description}',
  '',
  '{reproSteps}',
  '',
  '{acceptanceCriteria}',
  '',
  '{comments}',
  '',
  'Reference: {link}'
].join('\n');

function section(heading: string, body: string | undefined): string {
  return body ? `## ${heading}\n\n${body}` : '';
}

function renderComments(comments: { author: string; createdDate: string; text: string }[]): string {
  if (comments.length === 0) return '';
  return comments
    .map((c) => {
      const date = (c.createdDate || '').slice(0, 10);
      const meta = [c.author, date].filter(Boolean).join(' · ');
      const body = htmlToText(c.text) ?? '';
      return `**${meta}**\n${body}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Substitute `{token}` placeholders. Section tokens carry their own heading and
 * collapse to empty when the field is missing. Any line whose tokens ALL resolve
 * to empty is dropped, so optional metadata rows disappear cleanly.
 */
function renderTemplate(template: string, tokens: Record<string, string>): string {
  const tokenRe = /\{(\w+)\}/g;
  const out: string[] = [];
  for (const line of template.split('\n')) {
    const matches = [...line.matchAll(tokenRe)];
    if (matches.length === 0) {
      out.push(line);
      continue;
    }
    let anyFilled = false;
    const replaced = line.replace(tokenRe, (_, name: string) => {
      const value = tokens[name] ?? '';
      if (value !== '') anyFilled = true;
      return value;
    });
    if (anyFilled) out.push(replaced);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function buildPrompt(client: AzureClient, node: WorkItemNode): Promise<string> {
  const d = await getWorkItemDetails(client, node.workItem.id, node.projectName);
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const preamble = (cfg.get<string>('chatPromptPreamble') ?? DEFAULT_PREAMBLE).trim();
  const template = cfg.get<string>('promptTemplate')?.trim() || DEFAULT_TEMPLATE;

  const tags = (d.tags ?? '')
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean)
    .join(', ');
  const parent = d.parent
    ? `#${d.parent.id}${d.parent.title ? ` — ${d.parent.title}` : ''}`
    : '';

  const tokens: Record<string, string> = {
    preamble,
    id: String(d.id),
    title: d.title,
    type: d.type,
    state: d.state,
    priority: typeof d.priority === 'number' ? String(d.priority) : '',
    assignedTo: d.assignedTo ?? '',
    iteration: d.iterationPath ?? '',
    tags,
    parent,
    link: node.url,
    description: section('Description', htmlToText(d.description)),
    reproSteps: section('Repro steps', htmlToText(d.reproSteps)),
    acceptanceCriteria: section('Acceptance criteria', htmlToText(d.acceptanceCriteria)),
    comments: section('Comments', renderComments(d.comments))
  };

  return renderTemplate(template, tokens);
}

async function withPrompt(
  client: AzureClient,
  node: WorkItemNode | undefined,
  use: (prompt: string) => Promise<void>
): Promise<void> {
  if (!node?.workItem) return;
  let prompt: string;
  try {
    prompt = await vscode.window.withProgress(
      { location: { viewId: 'azureBoards.workItems' } },
      () => buildPrompt(client, node)
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Could not load work item details: ${msg}`);
    return;
  }
  await use(prompt);
}

export async function copyAsPrompt(
  client: AzureClient,
  node: WorkItemNode | undefined
): Promise<void> {
  await withPrompt(client, node, async (prompt) => {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.setStatusBarMessage('Copied work item prompt — paste it into any chat', 3000);
  });
}
