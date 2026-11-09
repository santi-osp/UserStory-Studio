import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AzdoMetadataResult } from '../../models/types';
import { ApiService } from '../../services/api.service';
import { AzdoConfigService } from '../../services/azdo-config.service';
import { SettingsComponent } from './settings.component';

describe('SettingsComponent', () => {
  let apiService: jasmine.SpyObj<ApiService>;
  let configService: AzdoConfigService;
  let fixture: ComponentFixture<SettingsComponent>;
  let component: SettingsComponent;

  const loadedAt = '2026-07-27T20:15:00.000Z';
  const metadata: AzdoMetadataResult = {
    projects: ['Proyecto A', 'Proyecto B'],
    areaPaths: ['Proyecto A/Area'],
    iterationPaths: ['Proyecto A/Sprint 1'],
    projectMetadata: [
      {
        project: 'Proyecto A',
        areaPaths: ['Proyecto A/Area'],
        iterationPaths: ['Proyecto A/Sprint 1'],
      },
    ],
  };

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    apiService = jasmine.createSpyObj<ApiService>('ApiService', [
      'fetchAzdoMetadata',
    ]);
    apiService.fetchAzdoMetadata.and.resolveTo(metadata);

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [{ provide: ApiService, useValue: apiService }],
    }).compileComponents();

    configService = TestBed.inject(AzdoConfigService);
    configService.setOrganization('ExampleOrg');
  });

  afterEach(() => {
    fixture?.destroy();
    localStorage.clear();
    sessionStorage.clear();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('renders information language without connection or technical status terms', () => {
    createComponent();
    const text = fixture.nativeElement.textContent.toLowerCase();
    expect(text).toContain(
      'aún no has cargado la información de azure devops.',
    );
    expect(text).toContain('cargar información');
    expect(text).not.toContain('conectado');
    expect(text).not.toContain('sin conexión');
    expect(text).not.toContain('metadata');
  });

  it('loads information, stores it for the tab and clears the PAT field', async () => {
    createComponent();
    component.form.controls['azurePat'].setValue('test-pat-placeholder');

    await component.loadInformation();
    fixture.detectChanges();

    expect(apiService.fetchAzdoMetadata).toHaveBeenCalledOnceWith(
      { organization: 'ExampleOrg' },
      true,
    );
    expect(configService.getSessionInformationSnapshot()).toEqual(
      jasmine.objectContaining({
        version: 1,
        organization: 'ExampleOrg',
        projects: ['Proyecto A', 'Proyecto B'],
      }),
    );
    expect(component.form.controls['azurePat'].value).toBe('');
    expect(fixture.nativeElement.textContent).toContain(
      'Actualizar información',
    );
  });

  it('shows Colombia date and marks information stale after eight hours', () => {
    configService.setMetadata(metadata, loadedAt);
    spyOn(Date, 'now').and.returnValue(
      Date.parse(loadedAt) + 8 * 60 * 60 * 1000,
    );
    createComponent();

    expect(component.informationIsStale).toBeTrue();
    expect(component.informationMessage).toContain(
      '27/07/2026 a las 3:15 p. m.',
    );
    expect(component.informationMessage).toContain(
      'puede estar desactualizada',
    );
    expect(configService.getMetadataSnapshot().projects.length).toBe(2);
  });

  it('keeps counters and the previous timestamp visible while updating', async () => {
    configService.setRuntimeCredential('test-pat-placeholder');
    configService.setMetadata(metadata, loadedAt);
    let resolve!: (value: AzdoMetadataResult) => void;
    apiService.fetchAzdoMetadata.and.returnValue(
      new Promise((value) => (resolve = value)),
    );
    createComponent();

    const refresh = component.loadInformation();
    fixture.detectChanges();

    expect(component.isLoading).toBeTrue();
    expect(component.metadata.projects.length).toBe(2);
    expect(component.information?.loadedAt).toBe(loadedAt);
    expect(component.informationMessage).toBe(
      'Actualizando la información de Azure DevOps…',
    );
    expect(
      fixture.debugElement.query(By.css('button[type="submit"]')).attributes[
        'aria-busy'
      ],
    ).toBe('true');
    expect(
      fixture.debugElement.query(By.css('app-loading-spinner')),
    ).toBeTruthy();

    resolve(metadata);
    await refresh;
  });

  it('blocks duplicate refresh submissions', async () => {
    configService.setRuntimeCredential('test-pat-placeholder');
    let resolve!: (value: AzdoMetadataResult) => void;
    apiService.fetchAzdoMetadata.and.returnValue(
      new Promise((value) => (resolve = value)),
    );
    createComponent();

    const first = component.loadInformation();
    await component.loadInformation();
    expect(apiService.fetchAzdoMetadata).toHaveBeenCalledTimes(1);
    resolve(metadata);
    await first;
  });

  it('preserves previous information and exposes a recoverable inline error', async () => {
    configService.setRuntimeCredential('test-pat-placeholder');
    configService.setMetadata(metadata, loadedAt);
    apiService.fetchAzdoMetadata.and.rejectWith(
      Object.assign(new Error('remote'), { status: 500 }),
    );
    createComponent();

    await component.loadInformation();
    fixture.detectChanges();

    expect(component.metadata.projects.length).toBe(2);
    expect(component.information?.loadedAt).toBe(loadedAt);
    expect(component.refreshError).toBe(
      'No fue posible actualizar la información. Puedes seguir utilizando los datos cargados anteriormente.',
    );
    expect(fixture.debugElement.query(By.css('[role="alert"]'))).toBeTruthy();
  });

  it('keeps previous information when a replacement PAT is rejected', async () => {
    configService.setRuntimeCredential('first-placeholder');
    configService.setMetadata(metadata, loadedAt);
    apiService.fetchAzdoMetadata.and.rejectWith(
      Object.assign(new Error('unauthorized'), { status: 401 }),
    );
    createComponent();
    component.form.controls['azurePat'].setValue('replacement-placeholder');

    await component.loadInformation();

    expect(configService.hasRuntimeCredential()).toBeFalse();
    expect(configService.getSessionInformationSnapshot()?.loadedAt).toBe(
      loadedAt,
    );
    expect(component.form.controls['azurePat'].hasError('invalidCredential')).toBeTrue();
  });

  it('requires and focuses PAT without clearing information when no runtime credential exists', async () => {
    configService.setMetadata(metadata, loadedAt);
    createComponent();

    await component.loadInformation();
    fixture.detectChanges();

    expect(apiService.fetchAzdoMetadata).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe('azure-pat');
    expect(configService.getMetadataSnapshot().projects.length).toBe(2);
  });

  it('does not invalidate information while organization edits are uncommitted', () => {
    configService.setRuntimeCredential('test-pat-placeholder');
    configService.setMetadata(metadata, loadedAt);
    createComponent();

    component.form.controls['organization'].setValue('OtherOrg');
    component.form.controls['organization'].setValue('ExampleOrg');

    expect(configService.getOrganization()).toBe('ExampleOrg');
    expect(configService.getSessionInformationSnapshot()).not.toBeNull();
  });

  it('restores information after component recreation without an automatic request', () => {
    configService.setMetadata(metadata, loadedAt);
    createComponent();
    fixture.destroy();

    createComponent();

    expect(component.metadata.projects.length).toBe(2);
    expect(component.information?.loadedAt).toBe(loadedAt);
    expect(apiService.fetchAzdoMetadata).not.toHaveBeenCalled();
    expect(component.form.controls['azurePat'].value).toBe('');
  });

  it('clears only the form PAT reference when destroyed', () => {
    configService.setRuntimeCredential('test-pat-placeholder');
    configService.setMetadata(metadata, loadedAt);
    createComponent();
    component.form.controls['azurePat'].setValue('replacement-placeholder');

    component.ngOnDestroy();

    expect(component.form.controls['azurePat'].value).toBe('');
    expect(configService.hasRuntimeCredential()).toBeTrue();
    expect(configService.getSessionInformationSnapshot()).not.toBeNull();
  });

  it('keeps information current until the full eight-hour threshold', () => {
    configService.setMetadata(metadata, loadedAt);
    spyOn(Date, 'now').and.returnValue(
      Date.parse(loadedAt) + 8 * 60 * 60 * 1000 - 1,
    );
    createComponent();

    expect(component.informationIsStale).toBeFalse();
    expect(component.informationMessage).not.toContain('desactualizada');
  });

  it('shows a permissions recovery message when no previous information exists', async () => {
    configService.setRuntimeCredential('test-pat-placeholder');
    apiService.fetchAzdoMetadata.and.rejectWith(
      Object.assign(new Error('forbidden'), { status: 403 }),
    );
    createComponent();

    await component.loadInformation();

    expect(component.refreshError).toContain('no tiene permisos');
    expect(configService.getSessionInformationSnapshot()).toBeNull();
  });

  it('keeps previous information when Azure returns an empty replacement', async () => {
    configService.setRuntimeCredential('test-pat-placeholder');
    configService.setMetadata(metadata, loadedAt);
    apiService.fetchAzdoMetadata.and.resolveTo({
      projects: [],
      areaPaths: [],
      iterationPaths: [],
      projectMetadata: [],
    });
    createComponent();

    await component.loadInformation();

    expect(component.information?.loadedAt).toBe(loadedAt);
    expect(component.metadata.projects).toEqual(['Proyecto A', 'Proyecto B']);
    expect(component.refreshError).toContain('datos cargados anteriormente');
  });

  it('focuses organization before PAT when organization is missing', async () => {
    configService.setOrganization('');
    createComponent();
    component.form.controls['azurePat'].setValue('test-pat-placeholder');

    await component.loadInformation();

    expect(document.activeElement?.id).toBe('azure-organization');
    expect(apiService.fetchAzdoMetadata).not.toHaveBeenCalled();
  });

  it('requires an explicit PAT before committing a different organization', async () => {
    configService.setRuntimeCredential('test-pat-placeholder');
    configService.setMetadata(metadata, loadedAt);
    createComponent();
    component.form.controls['organization'].setValue('OtherOrg');

    await component.loadInformation();

    expect(document.activeElement?.id).toBe('azure-pat');
    expect(configService.getOrganization()).toBe('ExampleOrg');
    expect(configService.getSessionInformationSnapshot()?.loadedAt).toBe(
      loadedAt,
    );
  });
});
