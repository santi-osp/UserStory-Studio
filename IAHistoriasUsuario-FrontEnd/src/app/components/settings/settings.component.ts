import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  AzdoMetadataResult,
  AzdoSessionInformation,
} from '../../models/types';
import { ApiRequestError, ApiService } from '../../services/api.service';
import {
  AzdoConfigService,
  AzdoInformationRequest,
} from '../../services/azdo-config.service';
import { LoadingSpinnerComponent } from '../shared/ui/loading-spinner/loading-spinner.component';
import { PageHeaderComponent } from '../shared/ui/page-header/page-header.component';
import { SectionCardComponent } from '../shared/ui/section-card/section-card.component';

const INFORMATION_STALE_AFTER_MS = 8 * 60 * 60 * 1000;

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LoadingSpinnerComponent,
    PageHeaderComponent,
    SectionCardComponent,
  ],
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements OnInit, OnDestroy {
  @ViewChild('connectionForm')
  private connectionFormElement?: ElementRef<HTMLFormElement>;

  form!: FormGroup;
  isLoading = false;
  submitted = false;
  showAzurePat = false;
  refreshError = '';
  information: AzdoSessionInformation | null = null;
  metadata: AzdoMetadataResult = {
    projects: [],
    areaPaths: [],
    iterationPaths: [],
    projectMetadata: [],
  };
  private readonly subscriptions = new Subscription();
  private activeInformationRefresh: Promise<void> | null = null;
  private destroyed = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly apiService: ApiService,
    private readonly azdoConfigService: AzdoConfigService,
  ) {}

  ngOnInit(): void {
    const organization = this.azdoConfigService.getOrganization();
    this.information =
      this.azdoConfigService.getSessionInformationSnapshot();
    this.metadata = this.azdoConfigService.getMetadataSnapshot();
    this.form = this.fb.group({
      organization: [organization, Validators.required],
      azurePat: [''],
    });

    this.subscriptions.add(
      this.azdoConfigService.metadata$.subscribe(
        (metadata) => (this.metadata = metadata),
      ),
    );
    this.subscriptions.add(
      this.azdoConfigService.sessionInformation$.subscribe(
        (information) => (this.information = information),
      ),
    );
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.form?.controls['azurePat']?.setValue('', { emitEvent: false });
    this.subscriptions.unsubscribe();
  }

  async loadInformation(): Promise<void> {
    if (this.activeInformationRefresh || this.isLoading) return;
    this.submitted = true;
    this.refreshError = '';
    this.form.updateValueAndValidity();

    const organization = String(
      this.form.controls['organization'].value ?? '',
    ).trim();
    const credentialInput = String(
      this.form.controls['azurePat'].value ?? '',
    ).trim();
    const organizationChanged =
      organization.toLowerCase() !==
      this.azdoConfigService.getOrganization().toLowerCase();
    const canReuseRuntimeCredential =
      !organizationChanged && this.azdoConfigService.hasRuntimeCredential();

    if (
      this.form.controls['organization'].invalid ||
      (!credentialInput && !canReuseRuntimeCredential)
    ) {
      this.focusFirstInvalidField(!credentialInput && !canReuseRuntimeCredential);
      return;
    }

    const runtimeCredential =
      credentialInput || this.azdoConfigService.getRuntimeCredential();
    this.azdoConfigService.setOrganization(organization);
    this.azdoConfigService.setRuntimeCredential(runtimeCredential);
    this.form.controls['azurePat'].setValue('', { emitEvent: false });
    const request = this.azdoConfigService.beginInformationRequest();
    if (!request) return;

    this.isLoading = true;
    const promise = this.refreshInformation(request).finally(() => {
      if (this.activeInformationRefresh === promise) {
        this.activeInformationRefresh = null;
        if (!this.destroyed) this.isLoading = false;
      }
    });
    this.activeInformationRefresh = promise;
    await promise;
  }

  private async refreshInformation(
    request: AzdoInformationRequest,
  ): Promise<void> {
    try {
      const metadata = await this.apiService.fetchAzdoMetadata(
        { organization: request.organization },
        true,
      );
      if (!this.azdoConfigService.isInformationRequestCurrent(request)) return;
      if (this.isMetadataEmpty(metadata)) {
        this.refreshError = this.hasInformation
          ? 'No fue posible actualizar la información. Puedes seguir utilizando los datos cargados anteriormente.'
          : 'Azure DevOps no devolvió información disponible. Revisa la organización y los permisos e inténtalo nuevamente.';
        return;
      }

      this.azdoConfigService.setMetadata(metadata);
      this.refreshError = '';
    } catch (error) {
      this.applyRefreshError(error, request);
    }
  }

  toggleAzurePatVisibility(): void {
    this.showAzurePat = !this.showAzurePat;
  }

  get hasInformation(): boolean {
    return this.information !== null;
  }

  get informationIsStale(): boolean {
    if (!this.information) return false;
    return (
      Date.now() - Date.parse(this.information.loadedAt) >=
      INFORMATION_STALE_AFTER_MS
    );
  }

  get informationMessage(): string {
    if (this.isLoading) {
      return this.hasInformation
        ? 'Actualizando la información de Azure DevOps…'
        : 'Cargando la información de Azure DevOps…';
    }
    if (this.refreshError) return this.refreshError;
    if (!this.information) {
      return 'Aún no has cargado la información de Azure DevOps.';
    }

    const loadedAt = this.formatLoadedAt(this.information.loadedAt);
    return this.informationIsStale
      ? `La información fue cargada el ${loadedAt} y puede estar desactualizada.`
      : `Información cargada el ${loadedAt}.`;
  }

  get submitLabel(): string {
    if (this.isLoading) {
      return this.hasInformation
        ? 'Actualizando información…'
        : 'Cargando información…';
    }
    return this.hasInformation
      ? 'Actualizar información'
      : 'Cargar información';
  }

  isFieldInvalid(field: 'organization' | 'azurePat'): boolean {
    if (!this.submitted) return false;
    if (field === 'organization') return this.form.controls[field].invalid;
    const organization = String(
      this.form.controls['organization'].value ?? '',
    ).trim();
    const organizationChanged =
      organization.toLowerCase() !==
      this.azdoConfigService.getOrganization().toLowerCase();
    return (
      this.form.controls[field].invalid ||
      (!String(this.form.controls[field].value ?? '').trim() &&
        (organizationChanged ||
          !this.azdoConfigService.hasRuntimeCredential()))
    );
  }

  private applyRefreshError(
    error: unknown,
    request: AzdoInformationRequest,
  ): void {
    if (!this.azdoConfigService.isInformationRequestCurrent(request)) return;
    const requestError = error as Partial<ApiRequestError>;
    if (requestError.status === 401) {
      this.azdoConfigService.clearRuntimeCredential();
      if (!this.destroyed) {
        this.form.controls['azurePat'].setErrors({ invalidCredential: true });
        this.focusField('azure-pat');
      }
    }

    this.refreshError = this.hasInformation
      ? 'No fue posible actualizar la información. Puedes seguir utilizando los datos cargados anteriormente.'
      : this.errorWithoutPreviousInformation(requestError, error);
  }

  private errorWithoutPreviousInformation(
    requestError: Partial<ApiRequestError>,
    error: unknown,
  ): string {
    if (requestError.status === 401) {
      return 'El Azure PAT no es válido. Ingresa una credencial válida e inténtalo nuevamente.';
    }
    if (requestError.status === 403) {
      return 'La credencial no tiene permisos para cargar la información requerida. Revisa sus permisos e inténtalo nuevamente.';
    }
    const message = error instanceof Error ? error.message : '';
    if (
      requestError.status === 0 ||
      /network|red|timeout|demasiado en responder/i.test(message)
    ) {
      return 'No fue posible contactar Azure DevOps. Revisa la red e inténtalo nuevamente.';
    }
    return 'No fue posible cargar la información de Azure DevOps. Inténtalo nuevamente.';
  }

  private focusFirstInvalidField(forcePat = false): void {
    const id = !forcePat && this.form.controls['organization'].invalid
      ? 'azure-organization'
      : 'azure-pat';
    this.focusField(id);
  }

  private focusField(id: string): void {
    this.connectionFormElement?.nativeElement
      .querySelector<HTMLElement>(`#${id}`)
      ?.focus();
  }

  private formatLoadedAt(value: string): string {
    const date = new Date(value);
    const dateText = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
    const timeText = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .format(date)
      .replace(/\u00a0/g, ' ');
    return `${dateText} a las ${timeText}`;
  }

  private isMetadataEmpty(metadata: AzdoMetadataResult): boolean {
    return (
      metadata.projects.length === 0 &&
      metadata.areaPaths.length === 0 &&
      metadata.iterationPaths.length === 0 &&
      (metadata.projectMetadata?.length ?? 0) === 0
    );
  }
}
