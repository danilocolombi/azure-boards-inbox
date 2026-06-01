import * as vscode from 'vscode';
import { DEFAULT_TEMPLATE } from './chat';

const SECTION = 'azureBoards';
const TOKENS_HINT =
  'Tokens: {preamble} {id} {title} {type} {state} {priority} {assignedTo} {iteration} {tags} {parent} {link} {description} {reproSteps} {acceptanceCriteria}';

function templateFileUri(storageUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(storageUri, 'prompt-template.md');
}

function currentTemplate(): string {
  return vscode.workspace.getConfiguration(SECTION).get<string>('promptTemplate')?.trim() || DEFAULT_TEMPLATE;
}

export async function editPromptTemplate(storageUri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(storageUri);
  const file = templateFileUri(storageUri);
  await vscode.workspace.fs.writeFile(file, Buffer.from(currentTemplate(), 'utf8'));

  const doc = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(doc);

  const choice = await vscode.window.showInformationMessage(
    `Edit your prompt template, then save (Ctrl/Cmd+S) to apply.\n${TOKENS_HINT}`,
    'Reset to Default'
  );
  if (choice === 'Reset to Default') {
    await vscode.workspace.fs.writeFile(file, Buffer.from(DEFAULT_TEMPLATE, 'utf8'));
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await vscode.workspace
      .getConfiguration(SECTION)
      .update('promptTemplate', undefined, vscode.ConfigurationTarget.Global);
    vscode.window.setStatusBarMessage('Azure Boards: prompt template reset to default', 3000);
  }
}

/** Apply the template file back to settings whenever it is saved. */
export function registerPromptTemplateSync(storageUri: vscode.Uri): vscode.Disposable {
  const target = templateFileUri(storageUri).fsPath;
  return vscode.workspace.onDidSaveTextDocument(async (doc) => {
    if (doc.uri.fsPath !== target) return;
    await vscode.workspace
      .getConfiguration(SECTION)
      .update('promptTemplate', doc.getText(), vscode.ConfigurationTarget.Global);
    vscode.window.setStatusBarMessage('Azure Boards: prompt template updated', 3000);
  });
}
