import { TestCaseRefinementSelection } from '../models/types';
import {
  TEST_CASE_REFINEMENT_SUITE_TITLE,
  TEST_CASE_STATE_TRANSPORT_MARKER,
} from '../prompts/work-items/refinement/refine-test-cases.prompt';
import { parseTestCaseRefinementResponse } from './test-case-refinement';

describe('parseTestCaseRefinementResponse', () => {
  const selected: TestCaseRefinementSelection[] = [
    {
      ref: 'tc-1',
      position: 0,
      title: 'A',
      steps: [{ action: 'a', expected: 'e' }],
    },
    {
      ref: 'tc-3',
      position: 2,
      title: 'B',
      steps: [{ action: 'b', expected: 'f' }],
    },
  ];
  const response = (
    testCases: unknown[],
    extra: Record<string, unknown> = {},
  ) =>
    JSON.stringify({
      suiteTitle: TEST_CASE_REFINEMENT_SUITE_TITLE,
      testCases,
      ...extra,
    });
  const validCase = (ref: string, title: string) => ({
    title: `[${ref}] ${title}`,
    state: TEST_CASE_STATE_TRANSPORT_MARKER,
    steps: [{ action: 'Accion', expected: 'Resultado' }],
  });

  it('accepts exact refs in a different order and maps their original positions', () => {
    const result = parseTestCaseRefinementResponse(
      response([
        validCase('tc-3', 'Caso B mejorado'),
        validCase('tc-1', 'Caso A mejorado'),
      ]),
      selected,
    );

    expect(result.map((item) => item.ref)).toEqual(['tc-3', 'tc-1']);
    expect(result.map((item) => item.position)).toEqual([2, 0]);
  });

  [
    [validCase('tc-1', 'Solo uno')],
    [validCase('tc-1', 'A'), validCase('tc-2', 'Desconocido')],
    [validCase('tc-1', 'A'), validCase('tc-1', 'Duplicado')],
    [{ ...validCase('tc-1', 'A'), state: 'Ready' }, validCase('tc-3', 'B')],
    [{ ...validCase('tc-1', 'A'), id: 10 }, validCase('tc-3', 'B')],
    [{ ...validCase('tc-1', 'A'), steps: [] }, validCase('tc-3', 'B')],
  ].forEach((cases, index) => {
    it(`rejects invalid or unsafe response variant ${index + 1}`, () => {
      expect(() =>
        parseTestCaseRefinementResponse(response(cases), selected),
      ).toThrowError(
        'La respuesta no contiene una propuesta valida para todos los Test Cases seleccionados.',
      );
    });
  });

  it('rejects corrupted JSON, executable content, and extra root fields', () => {
    expect(() => parseTestCaseRefinementResponse('{bad', selected)).toThrow();
    expect(() =>
      parseTestCaseRefinementResponse(
        response([
          validCase('tc-1', '<script>alert(1)</script>'),
          validCase('tc-3', 'B'),
        ]),
        selected,
      ),
    ).toThrow();
    expect(() =>
      parseTestCaseRefinementResponse(
        response([validCase('tc-1', 'A'), validCase('tc-3', 'B')], {
          workItem: {},
        }),
        selected,
      ),
    ).toThrow();
  });
});
