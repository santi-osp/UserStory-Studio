import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { UI_TIMINGS } from '../../../config/ui-timings';
import {
  EMPTY_EXISTING_WORK_ITEM_FILTERS,
  ExistingWorkItemFilters,
  ExistingWorkItemSelection,
  ExistingWorkItemSummary,
} from '../../../models/existing-work-item-selector';
import {
  AzdoMetadataResult,
  ProjectMetadata,
  WorkItemLookupItem,
} from '../../../models/types';
import { ApiService } from '../../../services/api.service';
import { AzdoConfigService } from '../../../services/azdo-config.service';
import {
  AzdoPathKind,
  formatAzdoPathLabel,
  normalizeAzdoPath,
} from '../../../utils/azdo-path';
import { FeedbackMessageComponent } from '../ui/feedback-message/feedback-message.component';
import {
  RequiredFieldMarkerComponent,
} from '../ui/required-field-marker/required-field-marker.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../searchable-select/searchable-select.component';

@Component({
  selector: 'app-existing-work-item-selector',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SearchableSelectComponent,
    FeedbackMessageComponent,
    RequiredFieldMarkerComponent,
  ],
  templateUrl: './existing-work-item-selector.component.html',
})
export class ExistingWorkItemSelectorComponent
  implements OnInit, OnChanges, OnDestroy
{
  @Input() initialFilters: ExistingWorkItemFilters = {
    ...EMPTY_EXISTING_WORK_ITEM_FILTERS,
  };
  @Input() initialSelection: ExistingWorkItemSelection | null = null;
  @Input() allowedTypes: readonly string[] = [];
  @Input() projectRequired = false;
  @Input() selectionRequired = false;

  @Output() readonly filtersChange =
    new EventEmitter<ExistingWorkItemFilters>();
  @Output() readonly selectionChange =
    new EventEmitter<ExistingWorkItemSelection | null>();

  readonly form = new FormGroup({
    project: new FormControl('', { nonNullable: true }),
    areaPath: new FormControl('', { nonNullable: true }),
    iterationPath: new FormControl('', { nonNullable: true }),
    selectedId: new FormControl<number | string>('', { nonNullable: true }),
  });

  isLoadingMetadata = false;
  isSearching = false;
  searchError = '';
  metadataError = '';
  criterionError = '';
  hasSearched = false;
  selectedWorkItem: ExistingWorkItemSelection | null = null;
  projectOptions: string[] = [];
  areaPathOptions: string[] = [];
  iterationPathOptions: string[] = [];
  workItemOptions: SearchableSelectOption[] = [];
  readonly emptyMessage =
    'No se encontraron Work Items con los filtros seleccionados.';

  private readonly subscriptions = new Subscription();
  private readonly searchDebounceMs = UI_TIMINGS.workItemSearchDebounceMs;
  private projectMetadata: ProjectMetadata[] = [];
  private flatAreaPathOptions: string[] = [];
  private flatIterationPathOptions: string[] = [];
  private workItemItems: ExistingWorkItemSummary[] = [];
  private criterion = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchSequence = 0;
  private lastSearchKey = '';
  private applyingInputs = false;
  private runtimeContextKey = '';

  constructor(
    private readonly apiService: ApiService,
    private readonly azdoConfigService: AzdoConfigService,
  ) {}

  ngOnInit(): void {
    this.runtimeContextKey = this.getRuntimeContextKey();
    this.applyInputs();
    this.applyMetadata(this.azdoConfigService.getMetadataSnapshot());
    this.syncDependentControlsState();

    this.subscriptions.add(
      this.azdoConfigService.metadata$.subscribe((metadata) =>
        this.applyMetadata(metadata),
      ),
    );
    this.subscriptions.add(
      this.azdoConfigService.context$.subscribe(() => {
        const nextKey = this.getRuntimeContextKey();
        if (nextKey === this.runtimeContextKey) return;
        this.runtimeContextKey = nextKey;
        this.invalidateSearch(true);
      }),
    );
    this.subscriptions.add(
      this.form.controls.project.valueChanges.subscribe((project) => {
        if (this.applyingInputs) return;
        this.updatePathOptions(project);
        this.form.patchValue(
          { areaPath: '', iterationPath: '', selectedId: '' },
          { emitEvent: false },
        );
        this.syncDependentControlsState();
        this.invalidateSearch(true);
        this.emitFilters();
        this.scheduleSearch();
      }),
    );
    this.subscriptions.add(
      this.form.controls.areaPath.valueChanges.subscribe(() => {
        if (this.applyingInputs) return;
        this.invalidateSearch(true);
        this.emitFilters();
        this.scheduleSearch();
      }),
    );
    this.subscriptions.add(
      this.form.controls.iterationPath.valueChanges.subscribe(() => {
        if (this.applyingInputs) return;
        this.invalidateSearch(true);
        this.emitFilters();
        this.scheduleSearch();
      }),
    );
    this.subscriptions.add(
      this.form.controls.selectedId.valueChanges.subscribe((value) => {
        if (this.applyingInputs) return;
        const id = Number(value);
        const summary = this.workItemItems.find((item) => item.id === id);
        this.setSelection(summary ? this.toSelection(summary) : null, true);
      }),
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      !changes['initialFilters'] &&
      !changes['initialSelection'] &&
      !changes['allowedTypes']
    ) {
      return;
    }
    this.applyInputs();
    if (changes['allowedTypes'] && !changes['allowedTypes'].firstChange) {
      this.invalidateSearch(true);
    }
  }

  ngOnDestroy(): void {
    this.searchSequence += 1;
    this.clearSearchTimer();
    this.subscriptions.unsubscribe();
  }

  get projectSelectOptions(): SearchableSelectOption[] {
    return this.projectOptions.map((project) => ({
      value: project,
      label: project,
    }));
  }

  get areaSelectOptions(): SearchableSelectOption[] {
    return this.areaPathOptions.map((path) => ({
      value: path,
      label: this.formatPathLabel(path, 'area'),
    }));
  }

  get iterationSelectOptions(): SearchableSelectOption[] {
    return this.iterationPathOptions.map((path) => ({
      value: path,
      label: this.formatPathLabel(path, 'iteration'),
    }));
  }

  get hasProjectSelected(): boolean {
    return !!this.normalizeText(this.form.controls.project.value);
  }

  get canRefreshMetadata(): boolean {
    return this.isConfigured() && !this.isLoadingMetadata;
  }

  onSearchChange(value: string): void {
    const nextCriterion = value.trim();
    if (nextCriterion === this.criterion) return;
    this.criterion = nextCriterion;
    this.criterionError = '';
    this.invalidateSearch(true);
    this.emitFilters();
    this.scheduleSearch();
  }

  retrySearch(): void {
    void this.searchNow(true);
  }

  async refreshMetadata(): Promise<void> {
    if (this.isLoadingMetadata || !this.isConfigured()) return;
    this.isLoadingMetadata = true;
    this.metadataError = '';
    try {
      const metadata = await this.apiService.fetchAzdoMetadata(
        this.azdoConfigService.getConfigSnapshot(),
        true,
      );
      this.azdoConfigService.setMetadata(metadata);
    } catch (error) {
      this.metadataError = (error as Error).message;
    } finally {
      this.isLoadingMetadata = false;
    }
  }

  clearSelection(): void {
    this.setSelection(null, true);
  }

  formatPathLabel(path: string, kind: AzdoPathKind): string {
    return formatAzdoPathLabel(path, kind);
  }

  private applyInputs(): void {
    const filters = this.initialFilters ?? EMPTY_EXISTING_WORK_ITEM_FILTERS;
    this.applyingInputs = true;
    this.criterion = filters.criterion?.trim() ?? '';
    this.form.patchValue(
      {
        project: filters.project ?? '',
        areaPath: normalizeAzdoPath(filters.areaPath, 'area'),
        iterationPath: normalizeAzdoPath(filters.iterationPath, 'iteration'),
        selectedId: this.initialSelection?.summary.id ?? '',
      },
      { emitEvent: false },
    );
    this.setSelection(this.initialSelection ?? null, false);
    this.applyingInputs = false;
    this.updatePathOptions(filters.project ?? '');
    this.syncDependentControlsState();
  }

  private scheduleSearch(): void {
    this.clearSearchTimer();
    if (!this.validateCriterion()) return;
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      void this.searchNow();
    }, this.searchDebounceMs);
  }

  private clearSearchTimer(): void {
    if (!this.searchTimer) return;
    clearTimeout(this.searchTimer);
    this.searchTimer = null;
  }

  private validateCriterion(): boolean {
    const criterion = this.criterion.trim();
    if (!criterion) {
      this.criterionError = '';
      return false;
    }
    if (/^\d+$/.test(criterion) && Number(criterion) <= 0) {
      this.criterionError = 'Ingresa un ID de Work Item mayor que cero.';
      return false;
    }
    this.criterionError = '';
    return true;
  }

  private async searchNow(forceRefresh = false): Promise<void> {
    const project = this.normalizeText(this.form.controls.project.value);
    if (!project || !this.isConfigured() || !this.validateCriterion()) return;

    const areaPath = normalizeAzdoPath(
      this.form.controls.areaPath.value,
      'area',
    );
    const iterationPath = normalizeAzdoPath(
      this.form.controls.iterationPath.value,
      'iteration',
    );
    const allowedTypes = this.effectiveAllowedTypes();
    const searchKey = [
      this.runtimeContextKey,
      project.toLowerCase(),
      areaPath.toLowerCase(),
      iterationPath.toLowerCase(),
      this.criterion.toLowerCase(),
      ...allowedTypes.map((type) => type.toLowerCase()),
    ].join('::');
    if (!forceRefresh && searchKey === this.lastSearchKey) return;

    this.lastSearchKey = searchKey;
    this.isSearching = true;
    this.hasSearched = true;
    this.searchError = '';
    this.workItemItems = [];
    this.syncWorkItemOptions();
    const sequence = ++this.searchSequence;

    try {
      const response = await this.apiService.searchWorkItems({
        azdoProject: project,
        areaPath,
        iterationPath,
        searchText: this.criterion,
        azdoContext: this.azdoConfigService.getConfigSnapshot(),
      });
      if (sequence !== this.searchSequence) return;
      const allowedKeys = new Set(
        allowedTypes.map((type) => type.trim().toLowerCase()),
      );
      this.workItemItems = (response.items ?? [])
        .map((item) => this.toSummary(item))
        .filter(
          (item) =>
            allowedKeys.size === 0 || allowedKeys.has(item.type.toLowerCase()),
        );
      this.syncWorkItemOptions();
    } catch (error) {
      if (sequence !== this.searchSequence) return;
      this.searchError = (error as Error).message;
    } finally {
      if (sequence === this.searchSequence) this.isSearching = false;
    }
  }

  private invalidateSearch(clearSelection: boolean): void {
    this.searchSequence += 1;
    this.clearSearchTimer();
    this.lastSearchKey = '';
    this.isSearching = false;
    this.hasSearched = false;
    this.searchError = '';
    this.workItemItems = [];
    this.syncWorkItemOptions();
    if (clearSelection) this.setSelection(null, true);
  }

  private setSelection(
    selection: ExistingWorkItemSelection | null,
    emit: boolean,
  ): void {
    this.selectedWorkItem = selection;
    this.form.controls.selectedId.setValue(selection?.summary.id ?? '', {
      emitEvent: false,
    });
    if (
      selection &&
      !this.workItemItems.some((item) => item.id === selection.summary.id)
    ) {
      this.workItemItems = [...this.workItemItems, selection.summary];
    }
    this.syncWorkItemOptions();
    if (emit) this.selectionChange.emit(selection);
  }

  private emitFilters(): void {
    this.filtersChange.emit({
      project: this.normalizeText(this.form.controls.project.value),
      areaPath: normalizeAzdoPath(this.form.controls.areaPath.value, 'area'),
      iterationPath: normalizeAzdoPath(
        this.form.controls.iterationPath.value,
        'iteration',
      ),
      criterion: this.criterion,
      searchMode: 'id-or-title',
      allowedTypes: this.effectiveAllowedTypes(),
    });
  }

  private effectiveAllowedTypes(): readonly string[] {
    return this.allowedTypes.length > 0
      ? this.allowedTypes
      : (this.initialFilters.allowedTypes ?? []);
  }

  private syncWorkItemOptions(): void {
    this.workItemOptions = this.workItemItems.map((item) => ({
      value: item.id,
      label: item.displayName,
      meta: item.state || 'Sin estado',
    }));
  }

  private toSummary(item: WorkItemLookupItem): ExistingWorkItemSummary {
    return {
      id: item.id,
      type: item.workItemType?.trim() || 'Work Item',
      title: item.title?.trim() || `Work Item ${item.id}`,
      state: item.state?.trim() || 'Sin estado',
      areaPath: item.areaPath?.trim() || '',
      iterationPath: item.iterationPath?.trim() || '',
      parentId: null,
      displayName:
        item.displayName?.trim() || `${item.id} - ${item.title?.trim()}`,
    };
  }

  private toSelection(
    summary: ExistingWorkItemSummary,
  ): ExistingWorkItemSelection {
    return {
      summary,
      description: null,
      acceptanceCriteria: null,
      relations: [],
      metadata: { source: 'searchWorkItems' },
    };
  }

  private applyMetadata(metadata: AzdoMetadataResult): void {
    this.projectMetadata = (metadata.projectMetadata ?? []).map((item) => ({
      project: item.project,
      areaPaths: this.normalizePathCollection(item.areaPaths, 'area'),
      iterationPaths: this.normalizePathCollection(
        item.iterationPaths,
        'iteration',
      ),
    }));
    const fallbackProjects = this.projectMetadata.map((item) => item.project);
    this.projectOptions = (
      metadata.projects.length > 0 ? metadata.projects : fallbackProjects
    )
      .filter((project) => !!project?.trim())
      .sort((left, right) => left.localeCompare(right));
    if (
      !this.form.controls.project.value.trim() &&
      this.projectOptions.length === 1
    ) {
      this.form.controls.project.setValue(this.projectOptions[0]);
      this.emitFilters();
    }
    this.flatAreaPathOptions = this.normalizePathCollection(
      metadata.areaPaths,
      'area',
    );
    this.flatIterationPathOptions = this.normalizePathCollection(
      metadata.iterationPaths,
      'iteration',
    );
    this.updatePathOptions(this.form.controls.project.value);
  }

  private updatePathOptions(selectedProject: string): void {
    const project = this.normalizeText(selectedProject);
    const entry = this.projectMetadata.find(
      (item) => item.project.trim().toLowerCase() === project.toLowerCase(),
    );
    const useFlatCatalog = !project || this.projectMetadata.length === 0;
    this.areaPathOptions = useFlatCatalog
      ? this.flatAreaPathOptions
      : (entry?.areaPaths ?? []);
    this.iterationPathOptions = useFlatCatalog
      ? this.flatIterationPathOptions
      : (entry?.iterationPaths ?? []);
  }

  private syncDependentControlsState(): void {
    const enabled = this.hasProjectSelected;
    for (const control of [
      this.form.controls.areaPath,
      this.form.controls.iterationPath,
      this.form.controls.selectedId,
    ]) {
      if (enabled) control.enable({ emitEvent: false });
      else control.disable({ emitEvent: false });
    }
  }

  private normalizePathCollection(
    values: readonly string[] | null | undefined,
    kind: AzdoPathKind,
  ): string[] {
    const byKey = new Map<string, string>();
    for (const value of values ?? []) {
      const normalized = normalizeAzdoPath(value, kind);
      if (normalized) byKey.set(normalized.toLowerCase(), normalized);
    }
    return Array.from(byKey.values()).sort((left, right) =>
      left.localeCompare(right),
    );
  }

  private getRuntimeContextKey(): string {
    const context = this.azdoConfigService.getContextSnapshot();
    return `${context.organization.trim().toLowerCase()}::${context.correlationId}`;
  }

  private isConfigured(): boolean {
    return (
      !!this.azdoConfigService.getOrganization().trim() &&
      this.azdoConfigService.hasRuntimeCredential()
    );
  }

  private normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
