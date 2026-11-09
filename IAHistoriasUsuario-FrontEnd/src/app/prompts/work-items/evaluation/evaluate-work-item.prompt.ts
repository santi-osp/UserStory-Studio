import {
  formatGuidanceList,
  getWorkItemTypePromptGuidance,
  WORK_ITEM_EVALUATION_SYSTEM_PROMPT,
} from '../shared/work-item-prompt.constants';
import {
  EvaluationWorkItemPromptInput,
  WorkItemPromptResult,
} from '../shared/work-item-prompt.types';

export const EVALUATE_WORK_ITEM_PROMPT_TEMPLATE = `Evalua el siguiente work item de Azure DevOps usando criterios funcionales, tecnicos y de preparacion.

Tipo de work item objetivo: {{targetWorkItemType}}.

Estructura esperada para este tipo:
{{typeStructureGuidance}}

Enfoque de evaluacion:
{{typeJsonGuidance}}

Reglas:
- No inventes informacion no presente en el work item.
- Si falta informacion, reportala en missingInformation y refinementQuestions.
- Se concreto y accionable: cada observacion debe explicar el impacto o la mejora esperada.
- Ordena problemas, riesgos, ambiguedades y acciones por prioridad cuando aplique.
- Evalua claridad, alcance, criterios, riesgos funcionales, riesgos tecnicos, riesgos de negocio, ambiguedades, dependencias y preparacion para desarrollo.
- Incluye escenarios borde, validaciones de datos, permisos/seguridad y observabilidad/logs cuando sean relevantes; si no aplica, devuelve una lista vacia.
- Si no hay informacion suficiente, di exactamente que falta; no rellenes con supuestos no marcados.
- Devuelve exclusivamente JSON valido con el esquema de evaluacion esperado por el frontend.
- Usa maximo 5 elementos por lista.

Esquema JSON obligatorio:
{
  "summary": "resumen breve del work item evaluado",
  "qualityScore": 1,
  "qualityLevel": "Alta | Media | Baja",
  "readiness": "Lista para desarrollo | Requiere ajustes menores | Requiere refinamiento | Incompleta",
  "mainFindings": [],
  "risks": [],
  "ambiguities": [],
  "missingInformation": [],
  "acceptanceCriteriaFindings": [],
  "edgeCases": [],
  "dependencies": [],
  "dataValidations": [],
  "securityConsiderations": [],
  "observabilityConsiderations": [],
  "recommendations": [],
  "refinementQuestions": [],
  "suggestedAcceptanceCriteria": [],
  "improvedVersion": {
    "suggestedTitle": "",
    "suggestedDescription": "",
    "suggestedAcceptanceCriteria": []
  },
  "refinementPriority": "Critica | Alta | Media | Baja",
  "conclusion": "recomendacion final: listo/no listo para desarrollo y accion inmediata"
}

Contexto visible desde frontend:
- workItemId: {{workItemId}}
- title: {{title}}

El backend adjuntara los campos actuales del work item consultado en Azure DevOps antes de llamar a OpenAI.`;

export function buildEvaluateWorkItemPrompt(
  input: EvaluationWorkItemPromptInput,
): WorkItemPromptResult {
  const guidance = getWorkItemTypePromptGuidance(input.workItemType);
  const prompt = EVALUATE_WORK_ITEM_PROMPT_TEMPLATE.replace(
    '{{targetWorkItemType}}',
    input.workItemType.trim(),
  )
    .replace(
      '{{typeStructureGuidance}}',
      formatGuidanceList(guidance.structure),
    )
    .replace('{{typeJsonGuidance}}', formatGuidanceList(guidance.jsonFocus))
    .replace('{{workItemId}}', String(input.workItemId ?? ''))
    .replace('{{title}}', input.title?.trim() || '');

  return {
    systemPrompt: WORK_ITEM_EVALUATION_SYSTEM_PROMPT,
    prompt,
  };
}
