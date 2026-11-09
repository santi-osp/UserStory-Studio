import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { BROWSER_STORAGE_KEYS } from '../config/browser-storage-keys';
import {
  AzdoContext,
  AzdoFlowContext,
  AzdoMetadataResult,
  AzdoSessionInformation,
  PersistedAzdoConfigV2,
  ProjectMetadata,
} from '../models/types';
import {
  safeGetLocalItem,
  safeGetSessionItem,
  safeRemoveLocalItem,
  safeRemoveSessionItem,
  safeSetLocalItem,
  safeSetSessionItem,
} from '../utils/browser-storage';

export interface AzdoInformationRequest {
  organization: string;
  credentialRevision: number;
  correlationId: string;
}

function createCorrelationId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => !!item);

  return Array.from(new Set(normalized));
}

function normalizeProjectMetadata(values: unknown): ProjectMetadata[] {
  if (!Array.isArray(values)) return [];

  const byProject = new Map<string, ProjectMetadata>();
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') continue;
    const project = normalizeText((entry as { project?: unknown }).project);
    if (!project) continue;
    const areaPaths = normalizeList(
      (entry as { areaPaths?: unknown }).areaPaths,
    );
    const iterationPaths = normalizeList(
      (entry as { iterationPaths?: unknown }).iterationPaths,
    );
    const existing = byProject.get(project);
    byProject.set(
      project,
      existing
        ? {
            project,
            areaPaths: Array.from(
              new Set([...existing.areaPaths, ...areaPaths]),
            ),
            iterationPaths: Array.from(
              new Set([...existing.iterationPaths, ...iterationPaths]),
            ),
          }
        : { project, areaPaths, iterationPaths },
    );
  }

  return Array.from(byProject.values());
}

function emptyMetadata(): AzdoMetadataResult {
  return {
    projects: [],
    areaPaths: [],
    iterationPaths: [],
    projectMetadata: [],
  };
}

function isSessionInformationShape(
  value: unknown,
): value is AzdoSessionInformation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AzdoSessionInformation>;
  const allowedKeys = new Set([
    'version',
    'organization',
    'loadedAt',
    'projects',
    'areaPaths',
    'iterationPaths',
    'projectMetadata',
  ]);
  if (
    !Object.keys(candidate).every((key) => allowedKeys.has(key)) ||
    candidate.version !== 1 ||
    !normalizeText(candidate.organization) ||
    !normalizeText(candidate.loadedAt) ||
    Number.isNaN(Date.parse(candidate.loadedAt ?? '')) ||
    !Array.isArray(candidate.projects) ||
    !Array.isArray(candidate.areaPaths) ||
    !Array.isArray(candidate.iterationPaths) ||
    !Array.isArray(candidate.projectMetadata)
  ) {
    return false;
  }

  const listsContainOnlyStrings = [
    candidate.projects,
    candidate.areaPaths,
    candidate.iterationPaths,
  ].every((items) => items.every((item) => typeof item === 'string'));
  if (!listsContainOnlyStrings) return false;

  return candidate.projectMetadata.every(
    (entry) =>
      !!entry &&
      typeof entry === 'object' &&
      Object.keys(entry).every((key) =>
        ['project', 'areaPaths', 'iterationPaths'].includes(key),
      ) &&
      typeof entry.project === 'string' &&
      Array.isArray(entry.areaPaths) &&
      entry.areaPaths.every((item) => typeof item === 'string') &&
      Array.isArray(entry.iterationPaths) &&
      entry.iterationPaths.every((item) => typeof item === 'string'),
  );
}

@Injectable({ providedIn: 'root' })
export class AzdoConfigService {
  private readonly contextSubject = new BehaviorSubject<AzdoFlowContext>({
    organization: '',
    correlationId: createCorrelationId(),
  });
  private runtimeCredential = '';
  private credentialRevision = 0;
  private readonly metadataSubject =
    new BehaviorSubject<AzdoMetadataResult>(emptyMetadata());
  private readonly sessionInformationSubject =
    new BehaviorSubject<AzdoSessionInformation | null>(null);

  readonly context$ = this.contextSubject.asObservable();
  readonly config$ = this.context$;
  readonly metadata$ = this.metadataSubject.asObservable();
  readonly sessionInformation$ = this.sessionInformationSubject.asObservable();

  private readonly legacyConfigStorageKey =
    BROWSER_STORAGE_KEYS.legacyAzdoConfig;
  private readonly configStorageKey = BROWSER_STORAGE_KEYS.azdoConfig;
  private readonly legacyMetadataStorageKey =
    BROWSER_STORAGE_KEYS.legacyAzdoMetadata;
  private readonly legacyConnectionSessionStorageKey =
    BROWSER_STORAGE_KEYS.legacyAzdoConnectionSession;
  private readonly sessionInformationStorageKey =
    BROWSER_STORAGE_KEYS.azdoSessionInformation;

  constructor() {
    this.restoreConfig();
    this.removeLegacyInformation();
    this.restoreSessionInformation();
  }

  getContextSnapshot(): AzdoFlowContext {
    return this.contextSubject.value;
  }

  getConfigSnapshot(): AzdoContext {
    return { organization: this.contextSubject.value.organization };
  }

  getOrganization(): string {
    return this.contextSubject.value.organization;
  }

  setOrganization(value: string): void {
    const organization = normalizeText(value);
    const current = this.contextSubject.value;
    const sameOrganization =
      organization.toLowerCase() === current.organization.toLowerCase();
    if (sameOrganization) {
      if (organization !== current.organization) {
        const next = { ...current, organization };
        this.contextSubject.next(next);
        this.persistConfig(next);
      } else {
        this.persistConfig(current);
      }
      return;
    }

    if (this.runtimeCredential) {
      this.runtimeCredential = '';
      this.credentialRevision += 1;
    }
    const next = { organization, correlationId: createCorrelationId() };
    this.contextSubject.next(next);
    this.persistConfig(next);
    this.clearMetadata();
  }

  getRuntimeCredential(): string {
    return this.runtimeCredential;
  }

  setRuntimeCredential(value: string): void {
    const credential = normalizeText(value);
    if (credential === this.runtimeCredential) return;
    this.runtimeCredential = credential;
    this.credentialRevision += 1;
    this.rotateRuntimeContext();
  }

  hasRuntimeCredential(): boolean {
    return !!this.runtimeCredential;
  }

  clearRuntimeCredential(): void {
    if (!this.runtimeCredential) return;
    this.runtimeCredential = '';
    this.credentialRevision += 1;
    this.rotateRuntimeContext();
  }

  beginInformationRequest(): AzdoInformationRequest | null {
    return this.getCurrentInformationRequest();
  }

  isInformationRequestCurrent(request: AzdoInformationRequest): boolean {
    const current = this.getCurrentInformationRequest();
    return (
      !!current &&
      current.organization === request.organization &&
      current.credentialRevision === request.credentialRevision &&
      current.correlationId === request.correlationId
    );
  }

  isConfigurationIncomplete(): boolean {
    return !this.getOrganization() || !this.hasRuntimeCredential();
  }

  getEffectiveContext(): AzdoContext {
    return this.getConfigSnapshot();
  }

  getMetadataSnapshot(): AzdoMetadataResult {
    return this.metadataSubject.value;
  }

  getSessionInformationSnapshot(): AzdoSessionInformation | null {
    return this.sessionInformationSubject.value;
  }

  setMetadata(
    metadata: AzdoMetadataResult,
    loadedAt = new Date().toISOString(),
  ): void {
    const normalized: AzdoMetadataResult = {
      projects: normalizeList(metadata.projects),
      areaPaths: normalizeList(metadata.areaPaths),
      iterationPaths: normalizeList(metadata.iterationPaths),
      projectMetadata: normalizeProjectMetadata(metadata.projectMetadata),
    };
    this.metadataSubject.next(normalized);

    const organization = this.getOrganization();
    if (!organization) {
      this.clearSessionInformation();
      return;
    }

    const validLoadedAt = Number.isNaN(Date.parse(loadedAt))
      ? new Date().toISOString()
      : new Date(loadedAt).toISOString();
    const information: AzdoSessionInformation = {
      version: 1,
      organization,
      loadedAt: validLoadedAt,
      projects: normalized.projects,
      areaPaths: normalized.areaPaths,
      iterationPaths: normalized.iterationPaths,
      projectMetadata: normalized.projectMetadata ?? [],
    };
    this.sessionInformationSubject.next(information);
    safeSetSessionItem(
      this.sessionInformationStorageKey,
      JSON.stringify(information),
    );
  }

  clearMetadata(): void {
    this.metadataSubject.next(emptyMetadata());
    this.clearSessionInformation();
  }

  private clearSessionInformation(): void {
    this.sessionInformationSubject.next(null);
    safeRemoveSessionItem(this.sessionInformationStorageKey);
  }

  private rotateRuntimeContext(): void {
    const current = this.contextSubject.value;
    this.contextSubject.next({
      organization: current.organization,
      correlationId: createCorrelationId(),
    });
    this.persistConfig(this.contextSubject.value);
  }

  private restoreConfig(): void {
    const currentCorrelationId = this.contextSubject.value.correlationId;
    let organization = '';
    let correlationId = currentCorrelationId;
    const currentRaw = safeGetLocalItem(this.configStorageKey);

    if (currentRaw) {
      try {
        const parsed = JSON.parse(currentRaw) as Partial<PersistedAzdoConfigV2>;
        organization = normalizeText(parsed.organization);
        correlationId =
          normalizeText(parsed.correlationId) || currentCorrelationId;
      } catch {
        safeRemoveLocalItem(this.configStorageKey);
      }
    } else {
      const legacyRaw = safeGetLocalItem(this.legacyConfigStorageKey);
      if (legacyRaw) {
        try {
          const parsed = JSON.parse(legacyRaw) as {
            organization?: unknown;
            correlationId?: unknown;
          };
          organization = normalizeText(parsed.organization);
          correlationId =
            normalizeText(parsed.correlationId) || currentCorrelationId;
        } catch {
          // A legacy secret is intentionally never restored, including from corrupt data.
        }
      }
    }

    safeRemoveLocalItem(this.legacyConfigStorageKey);
    const restored = { organization, correlationId };
    this.contextSubject.next(restored);
    this.persistConfig(restored);
  }

  private getCurrentInformationRequest(): AzdoInformationRequest | null {
    const context = this.contextSubject.value;
    if (!context.organization || !this.runtimeCredential) return null;
    return {
      organization: context.organization,
      credentialRevision: this.credentialRevision,
      correlationId: context.correlationId,
    };
  }

  private persistConfig(config: AzdoFlowContext): void {
    const safeConfig: PersistedAzdoConfigV2 = {
      version: 2,
      organization: normalizeText(config.organization),
      correlationId:
        normalizeText(config.correlationId) || createCorrelationId(),
    };
    safeSetLocalItem(this.configStorageKey, JSON.stringify(safeConfig));
  }

  private restoreSessionInformation(): void {
    const raw = safeGetSessionItem(this.sessionInformationStorageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        !isSessionInformationShape(parsed) ||
        parsed.organization.toLowerCase() !== this.getOrganization().toLowerCase()
      ) {
        this.clearSessionInformation();
        return;
      }

      const restored: AzdoSessionInformation = {
        version: 1,
        organization: normalizeText(parsed.organization),
        loadedAt: new Date(parsed.loadedAt).toISOString(),
        projects: normalizeList(parsed.projects),
        areaPaths: normalizeList(parsed.areaPaths),
        iterationPaths: normalizeList(parsed.iterationPaths),
        projectMetadata: normalizeProjectMetadata(parsed.projectMetadata),
      };
      this.sessionInformationSubject.next(restored);
      this.metadataSubject.next({
        projects: restored.projects,
        areaPaths: restored.areaPaths,
        iterationPaths: restored.iterationPaths,
        projectMetadata: restored.projectMetadata,
      });
    } catch {
      this.clearSessionInformation();
    }
  }

  private removeLegacyInformation(): void {
    safeRemoveLocalItem(this.legacyMetadataStorageKey);
    safeRemoveSessionItem(this.legacyConnectionSessionStorageKey);
  }
}
