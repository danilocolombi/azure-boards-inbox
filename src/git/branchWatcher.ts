import * as vscode from 'vscode';

interface GitExtensionShape {
  getAPI(version: 1): GitAPIShape;
}
interface GitAPIShape {
  readonly repositories: RepositoryShape[];
  readonly onDidOpenRepository: vscode.Event<RepositoryShape>;
  readonly onDidCloseRepository: vscode.Event<RepositoryShape>;
}
interface RepositoryShape {
  readonly state: {
    readonly HEAD?: { readonly name?: string };
    readonly onDidChange: vscode.Event<void>;
  };
}

/** Builds a regex from `branchNamePattern` that captures the work item id. */
function patternToRegex(pattern: string): RegExp {
  const escapeLiteral = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = pattern.split(/(\{[a-z]+\})/g);
  const body = parts
    .map((p) => {
      switch (p) {
        case '{id}':
          return '(?<id>\\d+)';
        case '{title}':
          return '[^/]+';
        case '{type}':
          return '[a-zA-Z0-9-]+';
        default:
          return escapeLiteral(p);
      }
    })
    .join('');
  // anchor at word boundary so it can appear anywhere in a longer branch name
  return new RegExp(body);
}

/**
 * Watch every git repository in the workspace and emit the work item id parsed
 * out of the active branch (from `azureBoards.branchNamePattern`). Falls back to
 * a generic `AB#1234` lookup if the configured pattern doesn't match.
 */
export class BranchWorkItemWatcher implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<number | undefined>();
  readonly onDidChange = this._onDidChange.event;

  private gitApi: GitAPIShape | undefined;
  private disposables: vscode.Disposable[] = [];
  private repoSubs = new Map<RepositoryShape, vscode.Disposable>();
  private lastId: number | undefined;

  constructor() {
    void this.init();
  }

  get current(): number | undefined {
    return this.lastId;
  }

  private async init(): Promise<void> {
    const ext = vscode.extensions.getExtension<GitExtensionShape>('vscode.git');
    if (!ext) return;
    if (!ext.isActive) {
      try {
        await ext.activate();
      } catch {
        return;
      }
    }
    this.gitApi = ext.exports.getAPI(1);
    for (const repo of this.gitApi.repositories) this.attach(repo);
    this.disposables.push(this.gitApi.onDidOpenRepository((r) => this.attach(r)));
    this.disposables.push(this.gitApi.onDidCloseRepository((r) => this.detach(r)));
    this.recompute();
  }

  private attach(repo: RepositoryShape): void {
    const sub = repo.state.onDidChange(() => this.recompute());
    this.repoSubs.set(repo, sub);
    this.recompute();
  }

  private detach(repo: RepositoryShape): void {
    this.repoSubs.get(repo)?.dispose();
    this.repoSubs.delete(repo);
    this.recompute();
  }

  /** Re-derive the active id from the focused or first repository. */
  private recompute(): void {
    if (!this.gitApi) return;
    const pattern = vscode.workspace
      .getConfiguration('azureBoards')
      .get<string>('branchNamePattern') ?? '{type}/{id}-{title}';
    let regex: RegExp;
    try {
      regex = patternToRegex(pattern);
    } catch {
      regex = /(\d+)/;
    }
    const fallback = /AB#?(\d+)/i;

    let id: number | undefined;
    for (const repo of this.gitApi.repositories) {
      const branch = repo.state.HEAD?.name;
      if (!branch) continue;
      const m = branch.match(regex) ?? branch.match(fallback);
      if (m) {
        const candidate = Number((m.groups && m.groups.id) ?? m[1]);
        if (Number.isFinite(candidate)) {
          id = candidate;
          break;
        }
      }
    }
    if (id !== this.lastId) {
      this.lastId = id;
      this._onDidChange.fire(id);
    }
  }

  /** Force a re-evaluation after the user edits branchNamePattern. */
  refresh(): void {
    this.recompute();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    for (const d of this.repoSubs.values()) d.dispose();
    this.repoSubs.clear();
    this.disposables = [];
  }
}
