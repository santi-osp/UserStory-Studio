import { Injectable } from '@angular/core';
import { WorkItemPayload } from '../models/types';
import {
  PreviewHistoryItem,
  PreviewHistoryRefinementScope,
  PreviewHistorySource,
  PreviewHistoryVersionType,
} from '../models/preview-history';
import {
  safeGetSessionItem,
  safeRemoveSessionItem,
  safeSetSessionItem,
} from '../utils/browser-storage';
import { BROWSER_STORAGE_KEYS } from '../config/browser-storage-keys';

export const PREVIEW_HISTORY_STORAGE_KEY =
  BROWSER_STORAGE_KEYS.previewHistory;
const PREVIEW_HISTORY_LIMIT = 5;
const SENSITIVE_KEYS = new Set([
  'azurepat',
  'authorization',
  'headers',
  'logs',
  'pat',
  'token',
  'secret',
  'apikey',
  'password',
  'credential',
]);
const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

@Injectable({ providedIn: 'root' })
export class PreviewHistoryService {
  save(
    payload: WorkItemPayload,
    source: PreviewHistorySource,
    versionType: PreviewHistoryVersionType = 'generated',
    refinementScope?: PreviewHistoryRefinementScope,
  ): PreviewHistoryItem[] {
    if (!this.hasCompletePayload(payload)) {
      return this.getHistory();
    }

    const safePayload = this.sanitizePayload(payload);
    const normalizedJson = this.toNormalizedJson(safePayload);
    const fingerprint = normalizedJson;
    const current = this.getHistory();
    if (current[0]?.fingerprint === fingerprint) {
      return current;
    }
    const item: PreviewHistoryItem = {
      storageVersion: 2,
      id: this.createId(),
      createdAt: new Date().toISOString(),
      source,
      versionType,
      ...(versionType === 'refinementAccepted' && refinementScope
        ? { refinementScope }
        : {}),
      title: safePayload.workItem.title.trim(),
      workItemType: safePayload.workItemType?.trim() || 'User Story',
      project: safePayload.azdoProject.trim(),
      areaPath: safePayload.areaPath.trim(),
      iterationPath: safePayload.iterationPath.trim(),
      testCasesCount: Array.isArray(safePayload.testCases)
        ? safePayload.testCases.length
        : 0,
      payload: safePayload,
      normalizedJson,
      fingerprint,
    };

    const next = [item, ...current].slice(0, PREVIEW_HISTORY_LIMIT);
    this.write(next);
    return structuredClone(next);
  }

  getHistory(): PreviewHistoryItem[] {
    try {
      const raw = safeGetSessionItem(PREVIEW_HISTORY_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      const history = parsed
        .filter((item): item is PreviewHistoryItem => this.isHistoryItem(item))
        .map((item) => this.sanitizeHistoryItem(item))
        .slice(0, PREVIEW_HISTORY_LIMIT);
      return structuredClone(history);
    } catch {
      return [];
    }
  }

  remove(id: string): PreviewHistoryItem[] {
    const next = this.getHistory().filter((item) => item.id !== id);
    this.write(next);
    return structuredClone(next);
  }

  restore(item: PreviewHistoryItem, index: number): PreviewHistoryItem[] {
    const safeItem = this.sanitizeHistoryItem(item);
    const current = this.getHistory().filter(
      (historyItem) => historyItem.normalizedJson !== safeItem.normalizedJson,
    );
    const boundedIndex = Math.max(0, Math.min(index, current.length));
    current.splice(boundedIndex, 0, safeItem);
    const next = current.slice(0, PREVIEW_HISTORY_LIMIT);
    this.write(next);
    return structuredClone(next);
  }

  clear(): void {
    safeRemoveSessionItem(PREVIEW_HISTORY_STORAGE_KEY);
  }

  hasCompletePayload(payload: WorkItemPayload): boolean {
    return (
      !!payload &&
      typeof payload === 'object' &&
      typeof payload.azdoProject === 'string' &&
      typeof payload.iterationPath === 'string' &&
      typeof payload.areaPath === 'string' &&
      typeof payload.workItem === 'object' &&
      payload.workItem !== null &&
      typeof payload.workItem.title === 'string' &&
      !!payload.workItem.title.trim()
    );
  }

  fingerprint(payload: WorkItemPayload): string {
    return this.toNormalizedJson(this.sanitizePayload(payload));
  }

  private isHistoryItem(value: unknown): value is PreviewHistoryItem {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const item = value as Partial<PreviewHistoryItem>;
    return (
      item.storageVersion === 2 &&
      typeof item.id === 'string' &&
      typeof item.createdAt === 'string' &&
      (item.source === 'designer' || item.source === 'fromText') &&
      (item.versionType === 'generated' ||
        item.versionType === 'refinementAccepted') &&
      (item.refinementScope === undefined ||
        item.refinementScope === 'content' ||
        item.refinementScope === 'testCases') &&
      typeof item.title === 'string' &&
      typeof item.normalizedJson === 'string' &&
      typeof item.fingerprint === 'string' &&
      !!item.payload &&
      this.hasCompletePayload(item.payload as WorkItemPayload) &&
      item.fingerprint === this.fingerprint(item.payload as WorkItemPayload)
    );
  }

  private sanitizeHistoryItem(item: PreviewHistoryItem): PreviewHistoryItem {
    const safePayload = this.sanitizePayload(item.payload);
    const normalizedJson = this.toNormalizedJson(safePayload);
    return {
      storageVersion: 2,
      id: item.id,
      createdAt: item.createdAt,
      source: item.source,
      versionType: item.versionType,
      ...(item.versionType === 'refinementAccepted' && item.refinementScope
        ? { refinementScope: item.refinementScope }
        : {}),
      title: safePayload.workItem.title.trim(),
      workItemType: safePayload.workItemType?.trim() || 'User Story',
      project: safePayload.azdoProject.trim(),
      areaPath: safePayload.areaPath.trim(),
      iterationPath: safePayload.iterationPath.trim(),
      testCasesCount: Array.isArray(safePayload.testCases)
        ? safePayload.testCases.length
        : 0,
      payload: safePayload,
      normalizedJson,
      fingerprint: normalizedJson,
    };
  }

  private write(items: PreviewHistoryItem[]): void {
    if (items.length === 0) {
      safeRemoveSessionItem(PREVIEW_HISTORY_STORAGE_KEY);
      return;
    }

    safeSetSessionItem(PREVIEW_HISTORY_STORAGE_KEY, JSON.stringify(items));
  }

  private sanitizePayload(payload: WorkItemPayload): WorkItemPayload {
    return this.sanitizeValue(payload) as WorkItemPayload;
  }

  private sanitizeValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item));
    }

    if (value && typeof value === 'object') {
      const result = Object.create(null) as Record<string, unknown>;
      for (const [key, rawValue] of Object.entries(value)) {
        const normalizedKey = key.trim().toLowerCase();
        if (
          SENSITIVE_KEYS.has(normalizedKey) ||
          FORBIDDEN_OBJECT_KEYS.has(normalizedKey)
        ) {
          continue;
        }

        result[key] = this.sanitizeValue(rawValue);
      }
      return result;
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    return value;
  }

  private toNormalizedJson(payload: WorkItemPayload): string {
    return JSON.stringify(payload);
  }

  private createId(): string {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
