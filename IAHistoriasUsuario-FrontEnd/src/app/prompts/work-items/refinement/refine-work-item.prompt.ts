import {
  RefinableWorkItemField,
  WorkItemRefinementContent,
} from '../../../models/types';
import { WORK_ITEM_JSON_SYSTEM_PROMPT } from '../shared/work-item-prompt.constants';
import { getWorkItemSemanticProfile } from '../shared/work-item-prompt-contract';
import {
  requireSupportedWorkItemType,
  SupportedWorkItemType,
} from '../../../utils/work-item-type';
import {
  RefineWorkItemPromptInput,
  WorkItemPromptResult,
} from '../shared/work-item-prompt.types';

const FIELD_LABELS: Record<RefinableWorkItemField, string> = {
  title: 'title',
  description: 'description',
  acceptanceCriteria: 'acceptanceCriteria',
};

export const WORK_ITEM_REFINEMENT_SYSTEM_PROMPT = [
  WORK_ITEM_JSON_SYSTEM_PROMPT,
  'Eres un analista funcional y tecnico senior especializado en Azure DevOps.',
  'Refina exclusivamente los campos de contenido autorizados en la solicitud.',
].join(' ');

function uniqueFields(
  fields: readonly RefinableWorkItemField[],
): RefinableWorkItemField[] {
  return [...new Set(fields)];
}

function pickContent(
  content: WorkItemRefinementContent,
  fields: readonly RefinableWorkItemField[],
): WorkItemRefinementContent {
  const result: WorkItemRefinementContent = {};
  fields.forEach((field) => {
    result[field] = String(content[field] ?? '');
  });
  return result;
}

function buildResponseExample(
  fields: readonly RefinableWorkItemField[],
  workItemType: SupportedWorkItemType,
): {
  workItem: WorkItemRefinementContent;
} {
  const workItem: WorkItemRefinementContent = {};
  fields.forEach((field) => {
    workItem[field] =
      field === 'title'
        ? 'Titulo refinado u original sin cambios'
        : field === 'description'
          ? workItemType === 'Epic'
            ? '<p><strong>Visión:</strong> Descripción macro refinada</p>'
            : workItemType === 'Feature'
              ? '<p><strong>Capacidad:</strong> Descripción funcional refinada</p>'
              : '<p><strong>Rol:</strong> Rol suministrado</p><p><strong>Necesito:</strong> Necesidad refinada</p><p><strong>Para que:</strong> Valor suministrado</p>'
          : workItemType === 'Epic'
            ? '<p>Criterio macro de éxito verificable</p>'
            : workItemType === 'Feature'
              ? '<p>Criterio funcional verificable de la capacidad</p>'
              : '<p><strong>AC1 - Escenario: nombre</strong><br>Dado ... Cuando ... Entonces ...</p>';
  });
  return { workItem };
}

export function buildRefineWorkItemPrompt(
  input: RefineWorkItemPromptInput,
): WorkItemPromptResult {
  const workItemType = requireSupportedWorkItemType(input.workItemType);
  const semanticProfile = getWorkItemSemanticProfile(workItemType);
  const supportedFields = uniqueFields(input.supportedFields);
  const selectedFields = uniqueFields(input.selectedFields).filter((field) =>
    supportedFields.includes(field),
  );
  const unselectedFields = supportedFields.filter(
    (field) => !selectedFields.includes(field),
  );
  const currentContent = pickContent(input.currentContent, supportedFields);
  const responseExample = buildResponseExample(supportedFields, workItemType);
  const htmlFields = supportedFields.filter((field) =>
    /<[^>]+>/.test(currentContent[field] ?? ''),
  );
  const fieldRules = supportedFields.map((field) => {
    if (field === 'title') {
      return '- Si title esta seleccionado, produce un titulo claro y conciso.';
    }
    if (field === 'description') {
      return '- Si description esta seleccionada, mejora su estructura y precision.';
    }
    return '- Si acceptanceCriteria esta seleccionado, usa criterios verificables y no ambiguos.';
  });

  const prompt = [
    'Refina el contenido actual de este Work Item de Azure DevOps.',
    '',
    `Tipo real del Work Item: ${workItemType}.`,
    `Campos de contenido soportados: ${supportedFields.map((field) => FIELD_LABELS[field]).join(', ')}.`,
    `Campos seleccionados para refinar: ${selectedFields.map((field) => FIELD_LABELS[field]).join(', ')}.`,
    `Campos que debes conservar exactamente: ${
      unselectedFields.length > 0
        ? unselectedFields.map((field) => FIELD_LABELS[field]).join(', ')
        : 'ninguno'
    }.`,
    '',
    'Contenido base:',
    JSON.stringify(currentContent, null, 2),
    '',
    'Indicaciones del usuario:',
    input.instructions.trim(),
    '',
    'Reglas obligatorias:',
    '- Mejora unicamente los campos seleccionados y conserva exactamente los campos no seleccionados.',
    '- Mantiene el proposito, alcance y significado del Work Item y respeta su tipo real.',
    ...semanticProfile.descriptionRules.map((rule) => `- ${rule}`),
    ...(supportedFields.includes('acceptanceCriteria')
      ? semanticProfile.acceptanceCriteriaRules.map((rule) => `- ${rule}`)
      : []),
    '- No transformes una Epic o Feature al formato Rol/Necesito/Para que de User Story.',
    '- No inventes requisitos, dependencias, actores, tecnologias ni reglas de negocio.',
    '- Aplica las indicaciones sin contradecir el contenido base.',
    ...fieldRules,
    htmlFields.length > 0
      ? `- Conserva HTML compatible con Azure DevOps en: ${htmlFields.map((field) => FIELD_LABELS[field]).join(', ')}.`
      : '- No introduzcas Markdown; usa texto o HTML compatible con Azure DevOps segun el contrato.',
    '- No modifiques Value Area, Priority, Risk, Business Value, Story Points, Assigned To, estado, fechas, area, iteracion, campos personalizados, relaciones ni Test Cases.',
    '- Usa workItem unicamente como envoltorio tecnico requerido por el transporte existente.',
    '- No agregues propiedades de WorkItemPayload fuera de workItem ni propiedades distintas de las definidas dentro de workItem.',
    '- Devuelve todos los campos de contenido soportados, incluso los no seleccionados.',
    '- No devuelvas changedFields; el frontend calculara las diferencias.',
    '- Devuelve unicamente JSON valido, sin Markdown, bloques de codigo ni explicaciones.',
    '',
    'Contrato JSON minimo obligatorio para el transporte existente y ejemplo de salida:',
    JSON.stringify(responseExample, null, 2),
  ].join('\n');

  return {
    systemPrompt: WORK_ITEM_REFINEMENT_SYSTEM_PROMPT,
    prompt,
  };
}
