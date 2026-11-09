import { Injectable } from '@angular/core';
import {
  ApiConfigurationError,
} from '../utils/api-url';
import { ApplicationConfigurationService } from './application-configuration.service';

export type AiRequestFlow =
  | 'work-item-design-generation'
  | 'work-item-json-generation'
  | 'work-item-preview-generation'
  | 'work-item-evaluation'
  | 'work-item-refinement';

export type AiVisibleRequiredField =
  | 'need'
  | 'sourceWorkItemText'
  | 'prompt'
  | 'azdoProject'
  | 'iterationPath'
  | 'areaPath'
  | 'workItemId'
  | 'refinementInstructions';

export interface AiRequestValidationContext {
  apiBaseUrl?: string;
  apiConfigurationError?: string;
  organization?: string;
  runtimeCredentialAvailable?: boolean;
  azdoProject?: string;
  prompt?: string;
  need?: string;
  sourceWorkItemText?: string;
  workItemId?: number | string | null;
  iterationPath?: string;
  areaPath?: string;
  azdoMetadataLoaded?: boolean;
  workItemConfigLoaded?: boolean;
  missingRequiredDynamicFields?: (
    string | { referenceName: string; label: string }
  )[];
  workItemAvailable?: boolean;
  workItemType?: string;
  selectedRefinementFields?: string[];
  supportedRefinementFields?: string[];
  refinementInstructions?: string;
  baseContentAvailable?: boolean;
}

export interface AiRequestValidationResult {
  allowed: boolean;
  missing: string[];
  message: string;
  issues: AiRequestValidationIssue[];
  firstInvalidField?: AiVisibleRequiredField | 'dynamicWorkItemFields';
}

export interface AiRequestValidationIssue {
  label: string;
  fieldKey?: AiVisibleRequiredField | 'dynamicWorkItemFields';
  referenceName?: string;
}

interface AiRequirement {
  key: keyof AiRequestValidationContext;
  label: string;
  fieldKey?: AiVisibleRequiredField;
  visible?: boolean;
  missingWhen?: (context: AiRequestValidationContext) => boolean;
  missingLabel?: (context: AiRequestValidationContext) => string;
}

interface AiFlowRequirements {
  actionLabel: string;
  requirements: AiRequirement[];
}

const AZDO_METADATA_REQUIREMENT: AiRequirement = {
  key: 'azdoMetadataLoaded',
  label: 'informacion de Azure DevOps cargada',
  missingWhen: (context) => context.azdoMetadataLoaded !== true,
};

const API_CONFIGURATION_REQUIREMENT: AiRequirement = {
  key: 'apiBaseUrl',
  label: 'URL base del backend',
  missingLabel: (context) =>
    context.apiConfigurationError || 'URL base del backend',
};

const WORK_ITEM_CONFIG_REQUIREMENT: AiRequirement = {
  key: 'workItemConfigLoaded',
  label: 'campos del tipo de work item cargados',
  missingWhen: (context) => context.workItemConfigLoaded !== true,
};

const DYNAMIC_FIELDS_REQUIREMENT: AiRequirement = {
  key: 'missingRequiredDynamicFields',
  label: 'campos personalizados obligatorios',
  missingWhen: (context) =>
    (context.missingRequiredDynamicFields?.length ?? 0) > 0,
  missingLabel: (context) => {
    const fields = (context.missingRequiredDynamicFields ?? []).map((field) =>
      typeof field === 'string' ? field : field.label,
    );
    return fields.length
      ? `campos personalizados obligatorios (${fields.join(', ')})`
      : 'campos personalizados obligatorios';
  },
};

const AZDO_CONTEXT_REQUIREMENTS: AiRequirement[] = [
  { key: 'organization', label: 'organizacion Azure DevOps' },
  { key: 'runtimeCredentialAvailable', label: 'Azure PAT' },
  {
    key: 'azdoProject',
    label: 'proyecto Azure DevOps',
    fieldKey: 'azdoProject',
  },
];

const PATH_REQUIREMENTS: AiRequirement[] = [
  {
    key: 'iterationPath',
    label: 'ruta de iteracion',
    fieldKey: 'iterationPath',
  },
  { key: 'areaPath', label: 'area del proyecto', fieldKey: 'areaPath' },
];

const FLOW_REQUIREMENTS: Record<AiRequestFlow, AiFlowRequirements> = {
  'work-item-design-generation': {
    actionLabel: 'generar el Work Item con IA',
    requirements: [
      API_CONFIGURATION_REQUIREMENT,
      ...AZDO_CONTEXT_REQUIREMENTS,
      { key: 'need', label: 'descripcion de la necesidad', fieldKey: 'need' },
      ...PATH_REQUIREMENTS,
      AZDO_METADATA_REQUIREMENT,
      WORK_ITEM_CONFIG_REQUIREMENT,
      DYNAMIC_FIELDS_REQUIREMENT,
    ],
  },
  'work-item-json-generation': {
    actionLabel: 'preparar la vista previa del Work Item con IA',
    requirements: [
      API_CONFIGURATION_REQUIREMENT,
      ...AZDO_CONTEXT_REQUIREMENTS,
      {
        key: 'sourceWorkItemText',
        label: 'texto funcional de origen',
        fieldKey: 'sourceWorkItemText',
      },
      ...PATH_REQUIREMENTS,
      AZDO_METADATA_REQUIREMENT,
      WORK_ITEM_CONFIG_REQUIREMENT,
      DYNAMIC_FIELDS_REQUIREMENT,
    ],
  },
  'work-item-preview-generation': {
    actionLabel: 'preparar la vista previa con IA',
    requirements: [
      API_CONFIGURATION_REQUIREMENT,
      {
        key: 'prompt',
        label: 'información necesaria para la generación',
        fieldKey: 'prompt',
      },
    ],
  },
  'work-item-evaluation': {
    actionLabel: 'evaluar el Work Item con IA',
    requirements: [
      API_CONFIGURATION_REQUIREMENT,
      ...AZDO_CONTEXT_REQUIREMENTS,
      {
        key: 'workItemId',
        label: 'Work Item seleccionado',
        fieldKey: 'workItemId',
      },
    ],
  },
  'work-item-refinement': {
    actionLabel: 'generar el refinamiento del Work Item con IA',
    requirements: [
      API_CONFIGURATION_REQUIREMENT,
      {
        key: 'workItemAvailable',
        label: 'Work Item actual disponible',
        missingWhen: (context) => context.workItemAvailable !== true,
      },
      { key: 'workItemType', label: 'tipo del Work Item' },
      WORK_ITEM_CONFIG_REQUIREMENT,
      {
        key: 'selectedRefinementFields',
        label: 'al menos un campo de contenido seleccionado',
        missingWhen: (context) =>
          (context.selectedRefinementFields?.length ?? 0) === 0,
      },
      {
        key: 'supportedRefinementFields',
        label: 'campos seleccionados soportados por el tipo de Work Item',
        missingWhen: (context) => {
          const supported = new Set(context.supportedRefinementFields ?? []);
          return (context.selectedRefinementFields ?? []).some(
            (field) => !supported.has(field),
          );
        },
      },
      {
        key: 'refinementInstructions',
        label: 'indicaciones para el refinamiento',
        fieldKey: 'refinementInstructions',
      },
      {
        key: 'refinementInstructions',
        label: 'indicaciones de máximo 2.000 caracteres',
        missingWhen: (context) =>
          (context.refinementInstructions?.length ?? 0) > 2000,
      },
      {
        key: 'baseContentAvailable',
        label: 'contenido base suficiente en los campos seleccionados',
        missingWhen: (context) => context.baseContentAvailable !== true,
      },
      { key: 'prompt', label: 'solicitud de refinamiento preparada' },
    ],
  },
};

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

@Injectable({ providedIn: 'root' })
export class AiRequestValidationService {
  constructor(
    private readonly appConfiguration: ApplicationConfigurationService,
  ) {}

  validate(
    flow: AiRequestFlow,
    context: AiRequestValidationContext,
  ): AiRequestValidationResult {
    const definition = FLOW_REQUIREMENTS[flow];
    if (!definition) {
      return this.buildResult(
        [{ label: 'configuración de validación del flujo' }],
        'enviar datos a la IA',
      );
    }

    const effectiveContext = this.withDefaults(context);
    const issues: AiRequestValidationIssue[] = definition.requirements
      .filter((requirement) => this.isMissing(requirement, effectiveContext))
      .map((requirement) => ({
        label:
          requirement.missingLabel?.(effectiveContext) ?? requirement.label,
        fieldKey:
          requirement === DYNAMIC_FIELDS_REQUIREMENT
            ? ('dynamicWorkItemFields' as const)
            : requirement.fieldKey,
      }));

    const dynamicRequirementIndex = issues.findIndex(
      (issue) => issue.fieldKey === 'dynamicWorkItemFields',
    );
    if (dynamicRequirementIndex >= 0) {
      issues.splice(
        dynamicRequirementIndex,
        1,
        ...(effectiveContext.missingRequiredDynamicFields ?? []).map(
          (field) => ({
            label: typeof field === 'string' ? field : field.label,
            fieldKey: 'dynamicWorkItemFields' as const,
            referenceName:
              typeof field === 'string' ? undefined : field.referenceName,
          }),
        ),
      );
    }

    return this.buildResult(issues, definition.actionLabel);
  }

  isFieldRequired(
    flow: AiRequestFlow,
    fieldKey: AiVisibleRequiredField,
  ): boolean {
    const definition = FLOW_REQUIREMENTS[flow];
    if (!definition) {
      return false;
    }

    return definition.requirements.some(
      (requirement) =>
        requirement.fieldKey === fieldKey && (requirement.visible ?? true),
    );
  }

  private withDefaults(
    context: AiRequestValidationContext,
  ): AiRequestValidationContext {
    let apiBaseUrl = '';
    let apiConfigurationError: string | undefined;
    try {
      apiBaseUrl = this.appConfiguration.requireApiBaseUrl();
    } catch (error) {
      apiConfigurationError =
        error instanceof ApiConfigurationError
          ? error.message
          : 'La configuración del backend no es válida.';
    }

    return {
      ...context,
      apiBaseUrl,
      apiConfigurationError,
    };
  }

  private isMissing(
    requirement: AiRequirement,
    context: AiRequestValidationContext,
  ): boolean {
    if (requirement.missingWhen) {
      return requirement.missingWhen(context);
    }

    const value = context[requirement.key];
    if (typeof value === 'number') {
      return !Number.isFinite(value) || value <= 0;
    }

    if (typeof value === 'string') {
      return !normalizeText(value);
    }

    return !value;
  }

  private buildResult(
    issues: AiRequestValidationIssue[],
    actionLabel: string,
  ): AiRequestValidationResult {
    const missing = issues.map((issue) => issue.label);
    if (issues.length === 0) {
      return {
        allowed: true,
        missing: [],
        message: '',
        issues: [],
      };
    }

    return {
      allowed: false,
      missing,
      message: `No se envió la solicitud a la IA para ${actionLabel}. Falta: ${missing.join(', ')}. Corrige esos datos en la pantalla actual o en Configuración Azure y vuelve a intentarlo.`,
      issues,
      firstInvalidField: issues.find((issue) => issue.fieldKey)?.fieldKey,
    };
  }
}
