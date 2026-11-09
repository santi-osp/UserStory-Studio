import {
  TestCaseRefinementProposal,
  TestCaseRefinementSelection,
} from '../models/types';
import {
  TEST_CASE_REFINEMENT_SUITE_TITLE,
  TEST_CASE_STATE_TRANSPORT_MARKER,
} from '../prompts/work-items/refinement/refine-test-cases.prompt';

const MAX_TEST_CASES = 50;
const REF_PATTERN = /^\[(tc-[1-9]\d*)\]\s+(.+)$/s;
const FORBIDDEN_CONTENT =
  /<\/?(?:script|iframe|object|embed)\b|javascript\s*:/i;
const ROOT_KEYS = new Set(['suiteTitle', 'testCases']);
const CASE_KEYS = new Set(['title', 'state', 'steps']);
const STEP_KEYS = new Set(['action', 'expected']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}

export function parseTestCaseRefinementResponse(
  json: string,
  selected: readonly TestCaseRefinementSelection[],
): TestCaseRefinementProposal[] {
  const invalid = () =>
    new Error(
      'La respuesta no contiene una propuesta valida para todos los Test Cases seleccionados.',
    );
  if (selected.length === 0 || selected.length > MAX_TEST_CASES)
    throw invalid();

  let root: unknown;
  try {
    root = JSON.parse(json);
  } catch {
    throw invalid();
  }
  if (
    !isRecord(root) ||
    !exactKeys(root, ROOT_KEYS) ||
    root['suiteTitle'] !== TEST_CASE_REFINEMENT_SUITE_TITLE ||
    !Array.isArray(root['testCases']) ||
    root['testCases'].length !== selected.length
  ) {
    throw invalid();
  }

  const expected = new Map(selected.map((item) => [item.ref, item]));
  const seen = new Set<string>();
  const proposals: TestCaseRefinementProposal[] = [];
  let hasChanges = false;
  for (const rawCase of root['testCases']) {
    if (
      !isRecord(rawCase) ||
      !exactKeys(rawCase, CASE_KEYS) ||
      rawCase['state'] !== TEST_CASE_STATE_TRANSPORT_MARKER ||
      typeof rawCase['title'] !== 'string' ||
      !Array.isArray(rawCase['steps']) ||
      rawCase['steps'].length === 0
    ) {
      throw invalid();
    }
    const titleMatch = rawCase['title'].trim().match(REF_PATTERN);
    const ref = titleMatch?.[1] ?? '';
    const title = titleMatch?.[2]?.trim() ?? '';
    const source = expected.get(ref);
    if (!source || seen.has(ref) || !title || FORBIDDEN_CONTENT.test(title))
      throw invalid();

    const steps = rawCase['steps'].map((rawStep) => {
      if (
        !isRecord(rawStep) ||
        !exactKeys(rawStep, STEP_KEYS) ||
        typeof rawStep['action'] !== 'string' ||
        typeof rawStep['expected'] !== 'string'
      ) {
        throw invalid();
      }
      const action = rawStep['action'].trim();
      const expectedResult = rawStep['expected'].trim();
      if (
        !action ||
        !expectedResult ||
        FORBIDDEN_CONTENT.test(action) ||
        FORBIDDEN_CONTENT.test(expectedResult)
      ) {
        throw invalid();
      }
      return { action, expected: expectedResult };
    });
    seen.add(ref);
    hasChanges ||=
      title !== source.title.trim() ||
      JSON.stringify(steps) !==
        JSON.stringify(
          source.steps.map((step) => ({
            action: String(step.action ?? '').trim(),
            expected: String(step.expected ?? '').trim(),
          })),
        );
    proposals.push({ ref, position: source.position, title, steps });
  }
  if (seen.size !== expected.size || !hasChanges) throw invalid();
  return proposals;
}
