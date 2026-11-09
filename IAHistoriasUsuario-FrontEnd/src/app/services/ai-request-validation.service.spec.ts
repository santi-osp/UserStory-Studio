import { TestBed } from '@angular/core/testing';
import { AiRequestValidationService } from './ai-request-validation.service';
import { environment } from '../../Environments/environment';

describe('AiRequestValidationService', () => {
  let service: AiRequestValidationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AiRequestValidationService);
  });

  it('allows a generation flow when all configured requirements are present', () => {
    const result = service.validate('work-item-design-generation', {
      organization: 'Org',
      runtimeCredentialAvailable: true,
      azdoProject: 'Proyecto',
      need: 'Necesidad',
      iterationPath: 'Proyecto\\Sprint',
      areaPath: 'Proyecto\\Area',
      azdoMetadataLoaded: true,
      workItemConfigLoaded: true,
      missingRequiredDynamicFields: [],
    });

    expect(result.allowed).toBeTrue();
    expect(result.missing).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('returns missing requirements without depending on presentation services', () => {
    const result = service.validate('work-item-evaluation', {
      organization: 'Org',
      runtimeCredentialAvailable: false,
      azdoProject: '',
      workItemId: null,
    });

    expect(result.allowed).toBeFalse();
    expect(result.missing).toEqual([
      'Azure PAT',
      'proyecto Azure DevOps',
      'Work Item seleccionado',
    ]);
    expect(result.message).toContain('No se envió la solicitud a la IA');
    expect(result.firstInvalidField).toBe('azdoProject');
  });

  it('distinguishes an unconfigured backend from missing Azure DevOps context', () => {
    const previousBaseUrl = environment.api.baseUrl;
    environment.api.baseUrl = null;

    try {
      const result = service.validate('work-item-preview-generation', {
        prompt: 'Solicitud completa',
      });

      expect(result.allowed).toBeFalse();
      expect(result.missing).toEqual([
        'El backend del ambiente local todavía no está configurado.',
      ]);
      expect(result.message).toContain(
        'El backend del ambiente local todavía no está configurado.',
      );
      expect(result.missing).not.toContain('Azure PAT');
    } finally {
      environment.api.baseUrl = previousBaseUrl;
    }
  });

  it('identifies missing dynamic fields for inline rendering and focus', () => {
    const result = service.validate('work-item-json-generation', {
      organization: 'Org',
      runtimeCredentialAvailable: true,
      azdoProject: 'Proyecto',
      sourceWorkItemText: 'Origen',
      iterationPath: 'Proyecto\\Sprint',
      areaPath: 'Proyecto\\Area',
      azdoMetadataLoaded: true,
      workItemConfigLoaded: true,
      missingRequiredDynamicFields: [
        {
          referenceName: 'Microsoft.VSTS.Common.ValueArea',
          label: 'Value Area',
        },
      ],
    });

    expect(result.allowed).toBeFalse();
    expect(result.missing).toContain('Value Area');
    expect(result.firstInvalidField).toBe('dynamicWorkItemFields');
    expect(result.issues[0].referenceName).toBe(
      'Microsoft.VSTS.Common.ValueArea',
    );
  });

  it('exposes only visible required fields for the UI', () => {
    expect(
      service.isFieldRequired('work-item-design-generation', 'need'),
    ).toBeTrue();
    expect(
      service.isFieldRequired('work-item-evaluation', 'azdoProject'),
    ).toBeTrue();
    expect(
      service.isFieldRequired('work-item-evaluation', 'workItemId'),
    ).toBeTrue();
    expect(
      service.isFieldRequired('work-item-preview-generation', 'prompt'),
    ).toBeTrue();
    expect(
      service.isFieldRequired('work-item-preview-generation', 'azdoProject'),
    ).toBeFalse();
  });
});
