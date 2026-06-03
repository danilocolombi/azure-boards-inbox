import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { AzureClient } from '../azure/client';
import { setCommentsEnabled } from '../state/config';

/**
 * Opt-in flow for adding comments. Keeps the default token read-only: we only ask
 * for a write-scoped PAT when the user deliberately enables commenting. A write PAT
 * is a superset of a read PAT, so it replaces the stored one with no loss of reads.
 */
export async function enableComments(auth: AuthService, client: AzureClient): Promise<boolean> {
  const choice = await vscode.window.showInformationMessage(
    'Adding comments requires a Personal Access Token with Work Items (Read & Write). ' +
      'Your sign-in token is read-only by default. Update it now to enable commenting?',
    { modal: true },
    'Update Token'
  );
  if (choice !== 'Update Token') return false;

  if (!(await auth.promptWritePat())) return false;
  client.invalidate();
  await setCommentsEnabled(true);
  void vscode.window.showInformationMessage('Azure Boards: commenting enabled.');
  return true;
}
