import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { getAiBaseUrl, getAiModel } from '../state/config';

/**
 * Store (or clear) the API key for the OpenAI-compatible "Polish with AI" fallback.
 * Lets Polish work in editors with no `vscode.lm` provider (e.g. Cursor). The base
 * URL and model are plain settings (`azureBoards.ai.baseUrl` / `azureBoards.ai.model`);
 * only the key is secret, so it lives in SecretStorage. Only the draft is ever sent,
 * and only to the configured base URL.
 */
export async function setAiApiKey(auth: AuthService): Promise<boolean> {
  const hasKey = !!(await auth.getAiApiKey());
  const key = await vscode.window.showInputBox({
    title: 'Polish with AI — API Key',
    prompt: `OpenAI-compatible key for ${getAiBaseUrl() || 'azureBoards.ai.baseUrl'} (model: ${
      getAiModel() || 'set azureBoards.ai.model'
    }). Stored in SecretStorage; only your draft is sent.${hasKey ? ' Leave empty to clear.' : ''}`,
    password: true,
    ignoreFocusOut: true,
    placeHolder: hasKey ? 'A key is already saved — type a new one or leave empty to clear' : 'sk-…'
  });
  if (key === undefined) return false; // cancelled

  if (key.trim() === '') {
    await auth.clearAiApiKey();
    void vscode.window.showInformationMessage('Azure Boards: AI key cleared.');
    return true;
  }

  await auth.setAiApiKey(key.trim());
  if (!getAiBaseUrl() || !getAiModel()) {
    void vscode.window.showWarningMessage(
      'AI key saved. Also set azureBoards.ai.baseUrl and azureBoards.ai.model to enable Polish.'
    );
  } else {
    void vscode.window.showInformationMessage('Azure Boards: AI key saved. Polish is enabled.');
  }
  return true;
}
