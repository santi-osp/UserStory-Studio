import {
  RefineTestCasesPromptInput,
  WorkItemPromptResult,
} from '../shared/work-item-prompt.types';
import { requireSupportedWorkItemType } from '../../../utils/work-item-type';

export const TEST_CASE_STATE_TRANSPORT_MARKER = '__preserve_original_state__';
export const TEST_CASE_REFINEMENT_SUITE_TITLE = 'Refinamiento temporal';

export const TEST_CASE_REFINEMENT_SYSTEM_PROMPT =
  'Eres QA senior. Devuelve unicamente JSON valido y sigue exactamente el contrato solicitado.';

function technicalTitle(ref: string, title: string): string {
  return `[${ref}] ${title}`;
}

export function buildRefineTestCasesPrompt(
  input: RefineTestCasesPromptInput,
): WorkItemPromptResult {
  const workItemType = requireSupportedWorkItemType(input.workItemType);
  if (workItemType !== 'User Story') {
    throw new Error(
      `No se pueden refinar Test Cases para el tipo ${workItemType}.`,
    );
  }
  const selected = input.selectedTestCases.map((testCase) => ({
    title: technicalTitle(testCase.ref, testCase.title),
    steps: testCase.steps.map((step) => ({
      action: String(step.action ?? ''),
      expected: String(step.expected ?? ''),
    })),
  }));
  const modeRules =
    input.mode === 'improve'
      ? [
          'Conserva el escenario central de cada caso.',
          'Corrige ambiguedades y mejora titulo, acciones y resultados verificables.',
          'Agrega o elimina pasos solamente cuando aporte claridad.',
        ]
      : [
          'Reemplaza completamente el contenido de cada caso con un escenario coherente con el Work Item.',
          'No inventes requisitos ni dupliques escenarios entre los casos seleccionados.',
        ];

  const prompt = [
    'Refina exclusivamente los Test Cases seleccionados.',
    `Tipo real del Work Item: ${workItemType}.`,
    `Titulo actual: ${input.title.trim()}.`,
    `Descripcion actual: ${input.description.trim()}.`,
    ...(input.acceptanceCriteria?.trim()
      ? [
          `Criterios de aceptacion actuales: ${input.acceptanceCriteria.trim()}.`,
        ]
      : []),
    `Modo: ${input.mode === 'improve' ? 'mejorar' : 'regenerar'}.`,
    `Cantidad exacta: ${selected.length}.`,
    'Casos seleccionados:',
    JSON.stringify(selected, null, 2),
    'Indicaciones del usuario:',
    input.instructions.trim(),
    'Reglas obligatorias:',
    ...modeRules.map((rule) => `- ${rule}`),
    '- Devuelve exactamente un caso por cada referencia incluida entre corchetes al inicio del title.',
    '- Conserva cada referencia sin cambiarla y en el title de su caso; el orden puede variar.',
    '- No agregues ni elimines casos y no uses referencias desconocidas o duplicadas.',
    '- Produce titulos claros, pasos concretos y resultados verificables.',
    '- No incluyas Markdown, explicaciones, fences ni propiedades adicionales.',
    `- Usa exactamente "${TEST_CASE_STATE_TRANSPORT_MARKER}" como state tecnico en todos los casos; no representa ni modifica el estado real.`,
    '- Devuelve suiteTitle y testCases porque el transporte especializado los exige.',
    'Contrato exacto:',
    JSON.stringify(
      {
        suiteTitle: TEST_CASE_REFINEMENT_SUITE_TITLE,
        testCases: selected.map((testCase) => ({
          title: testCase.title,
          state: TEST_CASE_STATE_TRANSPORT_MARKER,
          steps: [
            { action: 'Accion concreta', expected: 'Resultado verificable' },
          ],
        })),
      },
      null,
      2,
    ),
  ].join('\n');

  return { systemPrompt: TEST_CASE_REFINEMENT_SYSTEM_PROMPT, prompt };
}
