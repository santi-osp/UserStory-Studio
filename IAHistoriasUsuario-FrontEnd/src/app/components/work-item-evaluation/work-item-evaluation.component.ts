import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { BROWSER_STORAGE_KEYS } from '../../config/browser-storage-keys';
import {
  EMPTY_EXISTING_WORK_ITEM_FILTERS,
  ExistingWorkItemFilters,
  ExistingWorkItemSelection,
} from '../../models/existing-work-item-selector';
import {
  EvaluateWorkItemResponse,
  WorkItemLookupItem,
} from '../../models/types';
import { ApiService } from '../../services/api.service';
import {
  AiRequestValidationService,
  AiVisibleRequiredField,
} from '../../services/ai-request-validation.service';
import { AzdoConfigService } from '../../services/azdo-config.service';
import { WorkItemPromptBuilderService } from '../../services/work-item-prompt-builder.service';
import { normalizeAzdoPath } from '../../utils/azdo-path';
import {
  safeGetSessionItem,
  safeRemoveLocalItem,
  safeRemoveSessionItem,
  safeSetSessionItem,
} from '../../utils/browser-storage';
import {
  ExistingWorkItemSelectorComponent,
} from '../shared/existing-work-item-selector/existing-work-item-selector.component';
import { FeedbackMessageComponent } from '../shared/ui/feedback-message/feedback-message.component';
import { PageHeaderComponent } from '../shared/ui/page-header/page-header.component';
import { SectionCardComponent } from '../shared/ui/section-card/section-card.component';

type EvaluationListKey =
  | 'mainFindings'
  | 'risks'
  | 'ambiguities'
  | 'missingInformation'
  | 'acceptanceCriteriaFindings'
  | 'edgeCases'
  | 'dependencies'
  | 'dataValidations'
  | 'securityConsiderations'
  | 'observabilityConsiderations'
  | 'recommendations'
  | 'refinementQuestions'
  | 'suggestedAcceptanceCriteria';

interface EvaluationListSection {
  title: string;
  key: EvaluationListKey;
}

interface WorkItemEvaluationPersistedState {
  filters: ExistingWorkItemFilters;
  selectedWorkItem: ExistingWorkItemSelection | null;
  result: EvaluateWorkItemResponse | null;
}

interface LegacyWorkItemEvaluationPersistedState {
  filters?: ExistingWorkItemFilters;
  azdoProject?: string;
  areaPath?: string;
  iterationPath?: string;
  selectedWorkItem?: ExistingWorkItemSelection | WorkItemLookupItem | null;
  result?: EvaluateWorkItemResponse | null;
}

@Component({
  selector: 'app-work-item-evaluation',
  standalone: true,
  imports: [
    CommonModule,
    ExistingWorkItemSelectorComponent,
    FeedbackMessageComponent,
    PageHeaderComponent,
    SectionCardComponent,
  ],
  templateUrl: './work-item-evaluation.component.html',
})
export class WorkItemEvaluationComponent implements OnInit, OnDestroy {
  result: EvaluateWorkItemResponse | null = null;
  selectedWorkItem: ExistingWorkItemSelection | null = null;
  selectorFilters: ExistingWorkItemFilters = {
    ...EMPTY_EXISTING_WORK_ITEM_FILTERS,
  };
  isEvaluating = false;
  status = '';
  error = '';
  warning = '';

  readonly sections: EvaluationListSection[] = [
    { title: 'Hallazgos principales', key: 'mainFindings' },
    { title: 'Riesgos', key: 'risks' },
    { title: 'Ambigüedades', key: 'ambiguities' },
    { title: 'Información faltante', key: 'missingInformation' },
    {
      title: 'Hallazgos en criterios de aceptación',
      key: 'acceptanceCriteriaFindings',
    },
    { title: 'Escenarios borde', key: 'edgeCases' },
    { title: 'Dependencias', key: 'dependencies' },
    { title: 'Validaciones de datos', key: 'dataValidations' },
    { title: 'Permisos y seguridad', key: 'securityConsiderations' },
    { title: 'Observabilidad y logs', key: 'observabilityConsiderations' },
    { title: 'Recomendaciones', key: 'recommendations' },
    { title: 'Preguntas de refinamiento', key: 'refinementQuestions' },
    { title: 'Criterios sugeridos', key: 'suggestedAcceptanceCriteria' },
  ];

  private readonly subscriptions = new Subscription();
  private readonly storageKey = BROWSER_STORAGE_KEYS.workItemEvaluationState;

  constructor(
    private readonly apiService: ApiService,
    private readonly azdoConfigService: AzdoConfigService,
    private readonly aiRequestValidation: AiRequestValidationService,
    private readonly workItemPromptBuilder: WorkItemPromptBuilderService,
  ) {}

  ngOnInit(): void {
    this.restoreState();
    this.updateWarning();
    this.subscriptions.add(
      this.azdoConfigService.context$.subscribe(() => this.updateWarning()),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get canEvaluate(): boolean {
    return (
      this.isAzdoConfigured &&
      !!this.selectorFilters.project.trim() &&
      !!this.selectedWorkItemId &&
      !this.isEvaluating
    );
  }

  get isAzdoConfigured(): boolean {
    const context = this.azdoConfigService.getContextSnapshot();
    return (
      !!context.organization.trim() &&
      this.azdoConfigService.hasRuntimeCredential()
    );
  }

  get selectedWorkItemId(): number | null {
    const id = this.selectedWorkItem?.summary.id;
    return Number.isFinite(id) && Number(id) > 0 ? Number(id) : null;
  }

  get hasImprovedVersion(): boolean {
    const version = this.result?.evaluation?.improvedVersion;
    return !!(
      version &&
      (version.suggestedTitle?.trim() ||
        version.suggestedDescription?.trim() ||
        version.suggestedAcceptanceCriteria?.length)
    );
  }

  get hasEvaluationLists(): boolean {
    return this.sections.some(
      (section) => this.getEvaluationList(section.key).length > 0,
    );
  }

  get evaluationItemCount(): number {
    return this.sections.reduce(
      (total, section) => total + this.getEvaluationList(section.key).length,
      0,
    );
  }

  get qualityScorePercent(): number {
    const score = Number(this.result?.evaluation?.qualityScore ?? 0);
    return Math.min(100, Math.max(0, (score / 5) * 100));
  }

  isAiFieldRequired(fieldKey: AiVisibleRequiredField): boolean {
    return this.aiRequestValidation.isFieldRequired(
      'work-item-evaluation',
      fieldKey,
    );
  }

  getEvaluationList(key: EvaluationListKey): string[] {
    return this.result?.evaluation?.[key] ?? [];
  }

  onFiltersChange(filters: ExistingWorkItemFilters): void {
    this.selectorFilters = filters;
    this.result = null;
    this.status = '';
    this.persistState();
  }

  onSelectionChange(selection: ExistingWorkItemSelection | null): void {
    this.selectedWorkItem = selection;
    this.result = null;
    this.status = '';
    this.persistState();
  }

  async evaluate(): Promise<void> {
    const context = this.azdoConfigService.getContextSnapshot();
    const validation = this.aiRequestValidation.validate(
      'work-item-evaluation',
      {
        organization: context.organization,
        runtimeCredentialAvailable:
          this.azdoConfigService.hasRuntimeCredential(),
        azdoProject: this.selectorFilters.project,
        workItemId: this.selectedWorkItemId,
      },
    );
    if (!validation.allowed) {
      this.error = validation.message;
      return;
    }

    const workItemId = this.selectedWorkItemId;
    const azdoProject = this.selectorFilters.project.trim();
    if (!workItemId || !azdoProject) {
      this.error = 'Selecciona proyecto y un Work Item para evaluar.';
      return;
    }

    this.isEvaluating = true;
    this.result = null;
    this.error = '';
    this.status = 'Evaluando Work Item...';

    try {
      const prompt = this.workItemPromptBuilder.buildEvaluationPrompt({
        workItemType: this.selectedWorkItem?.summary.type ?? '',
        workItemId,
        title: this.selectedWorkItem?.summary.title,
      });
      this.result = await this.apiService.evaluateWorkItem({
        workItemId,
        azdoProject,
        prompt: prompt.prompt,
        systemPrompt: prompt.systemPrompt,
        azdoContext: this.azdoConfigService.getConfigSnapshot(),
      });
      this.status = 'Evaluación completada.';
      this.persistState();
    } catch (error) {
      this.status = '';
      this.error = (error as Error).message;
    } finally {
      this.isEvaluating = false;
    }
  }

  resetResult(): void {
    this.result = null;
    this.status = '';
    this.error = '';
    this.persistState();
  }

  trackByValue(index: number, value: string): string {
    return `${index}-${value}`;
  }

  private updateWarning(): void {
    this.warning = this.isAzdoConfigured
      ? ''
      : 'Configura organización y PAT en Configuración Azure antes de evaluar historias.';
  }

  private persistState(): void {
    const state: WorkItemEvaluationPersistedState = {
      filters: this.selectorFilters,
      selectedWorkItem: this.selectedWorkItem,
      result: this.result,
    };
    safeRemoveLocalItem(this.storageKey);
    safeSetSessionItem(this.storageKey, JSON.stringify(state));
  }

  private restoreState(): void {
    safeRemoveLocalItem(this.storageKey);
    try {
      const raw = safeGetSessionItem(this.storageKey);
      if (!raw) return;
      const state = JSON.parse(raw) as LegacyWorkItemEvaluationPersistedState;
      this.selectorFilters = state.filters
        ? {
            ...EMPTY_EXISTING_WORK_ITEM_FILTERS,
            ...state.filters,
            allowedTypes: state.filters.allowedTypes ?? [],
          }
        : {
            ...EMPTY_EXISTING_WORK_ITEM_FILTERS,
            project: state.azdoProject?.trim() ?? '',
            areaPath: normalizeAzdoPath(state.areaPath, 'area'),
            iterationPath: normalizeAzdoPath(
              state.iterationPath,
              'iteration',
            ),
          };
      this.selectedWorkItem = this.restoreSelection(state.selectedWorkItem);
      this.result = state.result ?? null;
    } catch {
      safeRemoveSessionItem(this.storageKey);
      safeRemoveLocalItem(this.storageKey);
    }
  }

  private restoreSelection(
    value: ExistingWorkItemSelection | WorkItemLookupItem | null | undefined,
  ): ExistingWorkItemSelection | null {
    if (!value) return null;
    if ('summary' in value) return value;
    return {
      summary: {
        id: value.id,
        type: value.workItemType?.trim() || 'Work Item',
        title: value.title,
        state: value.state?.trim() || 'Sin estado',
        areaPath: value.areaPath ?? '',
        iterationPath: value.iterationPath ?? '',
        parentId: null,
        displayName: value.displayName || `${value.id} - ${value.title}`,
      },
      description: null,
      acceptanceCriteria: null,
      relations: [],
      metadata: { source: 'legacy-evaluation-state' },
    };
  }
}
