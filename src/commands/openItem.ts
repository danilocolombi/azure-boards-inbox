import * as vscode from 'vscode';
import { getOrganizationUrl } from '../state/config';

const ID_PATTERNS: RegExp[] = [
  /^\s*#?(\d+)\s*$/,                       // 1234  or  #1234
  /^\s*AB#?(\d+)\s*$/i,                    // AB#1234 or AB1234
  /_workitems\/edit\/(\d+)/i,              // any URL containing /_workitems/edit/{id}
  /workitemid=(\d+)/i                      // …?workitemid=1234
];

function parseId(input: string): number | undefined {
  for (const re of ID_PATTERNS) {
    const m = input.match(re);
    if (m) return Number(m[1]);
  }
  return undefined;
}

export async function openItem(): Promise<void> {
  const input = await vscode.window.showInputBox({
    title: 'Open Work Item in Browser',
    prompt: 'Paste a work item ID, AB#id, or full URL — opens in your browser',
    placeHolder: '1234, AB#1234, or https://dev.azure.com/contoso/_workitems/edit/1234',
    ignoreFocusOut: true,
    validateInput: (v) => (parseId(v ?? '') === undefined ? 'Could not find a work item id in that input.' : null)
  });
  if (!input) return;
  const id = parseId(input);
  if (id === undefined) return;

  const orgUrl = getOrganizationUrl();
  if (!orgUrl) {
    vscode.window.showWarningMessage('Sign in first so we know which organization to open.');
    return;
  }
  await vscode.env.openExternal(vscode.Uri.parse(`${orgUrl}/_workitems/edit/${id}`));
}
