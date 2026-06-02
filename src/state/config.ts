import * as vscode from 'vscode';

const SECTION = 'azureBoards';

export interface Subscription {
  projectId: string;
  projectName: string;
  order: number;
}

export interface PinnedItem {
  projectId: string;
  projectName: string;
  id: number;
}

function cfg() {
  return vscode.workspace.getConfiguration(SECTION);
}

export function getOrganizationUrl(): string {
  return (cfg().get<string>('organizationUrl') ?? '').replace(/\/+$/, '');
}

export async function setOrganizationUrl(url: string): Promise<void> {
  await cfg().update('organizationUrl', url.replace(/\/+$/, ''), vscode.ConfigurationTarget.Global);
}

export function getSubscriptions(): Subscription[] {
  const raw = cfg().get<Subscription[]>('subscriptions') ?? [];
  return [...raw].sort((a, b) => a.order - b.order);
}

export async function setSubscriptions(subs: Subscription[]): Promise<void> {
  const normalized = subs.map((s, i) => ({ ...s, order: i }));
  await cfg().update('subscriptions', normalized, vscode.ConfigurationTarget.Global);
}

export function getShowClosed(): boolean {
  return cfg().get<boolean>('showClosed') ?? false;
}

export async function setShowClosed(v: boolean): Promise<void> {
  await cfg().update('showClosed', v, vscode.ConfigurationTarget.Global);
}

export function getAssignedToMeOnly(): boolean {
  return cfg().get<boolean>('assignedToMeOnly') ?? true;
}

export async function setAssignedToMeOnly(v: boolean): Promise<void> {
  await cfg().update('assignedToMeOnly', v, vscode.ConfigurationTarget.Global);
}

export function getCurrentIterationOnly(): boolean {
  return cfg().get<boolean>('currentIterationOnly') ?? false;
}

export async function setCurrentIterationOnly(v: boolean): Promise<void> {
  await cfg().update('currentIterationOnly', v, vscode.ConfigurationTarget.Global);
}

export function getPinned(): PinnedItem[] {
  return cfg().get<PinnedItem[]>('pinned') ?? [];
}

export async function setPinned(items: PinnedItem[]): Promise<void> {
  await cfg().update('pinned', items, vscode.ConfigurationTarget.Global);
}

export function isPinned(id: number, projectId: string): boolean {
  return getPinned().some((p) => p.id === id && p.projectId === projectId);
}

export function getStaleAfterDays(): number {
  const n = cfg().get<number>('staleAfterDays') ?? 14;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function getAutoRefreshMinutes(): number {
  const n = cfg().get<number>('autoRefreshMinutes') ?? 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
