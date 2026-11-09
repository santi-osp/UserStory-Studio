import {
  SupportedWorkItemType,
  requireSupportedWorkItemType,
} from '../../../utils/work-item-type';

export const WORK_ITEM_JSON_SYSTEM_PROMPT = [
  'Eres un asistente experto en Azure DevOps.',
  'Responde exclusivamente con JSON valido.',
  'No agregues explicaciones, markdown ni texto fuera del JSON.',
  'No inventes informacion critica que no haya sido suministrada.',
].join(' ');

export const WORK_ITEM_EVALUATION_SYSTEM_PROMPT = [
  'Eres un analista funcional experto en calidad de work items de Azure DevOps.',
  'Evalua solo la informacion recibida; no consultes Azure DevOps ni asumas herramientas externas.',
  'No inventes reglas de negocio criticas; si algo no esta soportado por la entrada, marcalo como informacion faltante o pregunta de refinamiento.',
  'Responde exclusivamente con JSON valido compatible con el esquema solicitado.',
  'No agregues markdown, explicaciones fuera del JSON, credenciales, tokens ni informacion sensible.',
].join(' ');

export interface WorkItemTypePromptGuidance {
  structure: string[];
  jsonFocus: string[];
}

const GUIDANCE_BY_WORK_ITEM_TYPE: Record<
  SupportedWorkItemType,
  WorkItemTypePromptGuidance
> = {
  Epic: {
    structure: [
      'vision del producto o iniciativa',
      'objetivo estrategico',
      'alcance macro',
      'beneficios esperados',
      'criterios macro de exito',
      'descomposición necesaria',
    ],
    jsonFocus: [
      'claridad de la iniciativa y del objetivo estratégico',
      'valor, alcance macro y exclusiones',
      'dependencias, riesgos y descomposición necesaria',
    ],
  },
  Feature: {
    structure: [
      'descripcion funcional',
      'valor que entrega',
      'alcance de la capacidad',
      'criterios de aceptacion',
      'relacion con Epic si existe',
      'posibilidad de descomposición',
    ],
    jsonFocus: [
      'claridad de la capacidad y del valor funcional',
      'alcance y relación con Epic únicamente cuando exista',
      'criterios funcionales, dependencias y posibilidad de descomposición',
    ],
  },
  'User Story': {
    structure: [
      'rol, necesidad y valor',
      'alcance funcional',
      'criterios de aceptación cuando el campo exista',
      'reglas de negocio',
      'dependencias y casos borde',
    ],
    jsonFocus: [
      'claridad del rol, la necesidad y el valor',
      'reglas de negocio, alcance y dependencias',
      'testabilidad, criterios de aceptación y casos borde',
    ],
  },
};

export function getWorkItemTypePromptGuidance(
  value: unknown,
): WorkItemTypePromptGuidance {
  return GUIDANCE_BY_WORK_ITEM_TYPE[requireSupportedWorkItemType(value)];
}

export function formatGuidanceList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}
