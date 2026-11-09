import { WorkItemPromptContract } from './work-item-prompt-contract';

function list(values: readonly string[], prefix = 'workItem.'): string {
  return values.length > 0
    ? values.map((value) => `- ${prefix}${value}`).join('\n')
    : '- ninguno';
}

function testCaseRules(contract: WorkItemPromptContract): string[] {
  if (!contract.testCases.enabled) {
    return [
      '- No incluyas testCases ni testSuite.',
      '- No generes ejemplos, cantidades ni referencias a Test Plan.',
    ];
  }

  return [
    contract.testCases.countMode === 'fixed'
      ? `- Genera exactamente ${contract.testCases.fixedCount} Test Cases.`
      : '- Genera normalmente entre 3 y 5 Test Cases; supera 5 solo por escenarios diferentes, sin duplicados y nunca más de 50.',
    `- Usa exactamente state "${contract.testCases.state}" en todos los casos.`,
    '- Cada Test Case requiere title no vacío y al menos un step con action y expected no vacíos.',
    '- Conserva testSuite.planId sin modificarlo.',
  ];
}

export function buildWorkItemGenerationPrompt(
  contract: WorkItemPromptContract,
  sourceLabel: string,
  sourceContent: string,
): string {
  const acceptanceRules = contract.acceptanceCriteria.supported
    ? [
        '- acceptanceCriteria existe en la plantilla y debes completarlo con contenido funcional no vacío.',
        ...contract.semanticProfile.acceptanceCriteriaRules.map(
          (rule) => `- ${rule}`,
        ),
      ]
    : ['- No incluyas acceptanceCriteria porque la metadata no lo soporta.'];

  return [
    'Actúa como analista funcional experto en Azure DevOps.',
    'Devuelve exclusivamente JSON válido, sin Markdown, explicaciones ni texto externo.',
    '',
    `Tipo confirmado: ${contract.workItemType}.`,
    '',
    'Reglas semánticas de la descripción:',
    ...contract.semanticProfile.descriptionRules.map((rule) => `- ${rule}`),
    '- Usa HTML compatible con Azure DevOps: p, br, strong, ul y li.',
    '',
    'Campos permitidos dentro de workItem:',
    list(contract.allowedWorkItemFields),
    '',
    'Campos editables por la IA:',
    list(contract.aiEditableWorkItemFields),
    ...(contract.testCases.enabled ? ['- testCases'] : []),
    '',
    'Campos de workItem preservados exactamente:',
    list(contract.preservedWorkItemFields),
    '',
    'Campos prohibidos dentro de workItem:',
    list(contract.prohibitedWorkItemFields),
    '',
    'Campos raíz inmutables:',
    '- azdoOrg',
    '- azdoProject',
    '- workItemType',
    '- iterationPath',
    '- areaPath',
    ...(contract.testCases.enabled
      ? ['- testSuite', '- testSuite.planId']
      : []),
    '',
    'Reglas obligatorias:',
    '- Conserva exactamente las propiedades presentes en la plantilla y no agregues propiedades desconocidas.',
    '- Completa title y description con contenido funcional no vacío.',
    '- Modifica únicamente los campos declarados editables.',
    '- No inventes actores, reglas, métricas, responsables, fechas, tecnologías ni relaciones.',
    '- No uses emojis ni tokens internos de plantilla.',
    ...acceptanceRules,
    ...testCaseRules(contract),
    '',
    'Plantilla JSON contractual:',
    JSON.stringify(contract.aiTemplate, null, 2),
    '',
    `${sourceLabel}:`,
    sourceContent.trim(),
  ].join('\n');
}
