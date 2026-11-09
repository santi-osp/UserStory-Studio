import { TcFields } from '../models/types';

const TEST_CASE_PREFIX_PATTERN =
  /^(?:tc\s*-?\s*\d+|caso\s+de\s+prueba\s+\d+)\s*(?:[-–—:]\s*)?/i;

export function stripTestCaseNumberPrefix(title: string): string {
  return (title ?? '').trim().replace(TEST_CASE_PREFIX_PATTERN, '').trim();
}

export function normalizeTestCaseTitle(title: string, index: number): string {
  const suffix = stripTestCaseNumberPrefix(title) || 'Caso de prueba';
  return `TC ${index + 1} - ${suffix}`;
}

export function normalizeTestCaseTitles(testCases: TcFields[]): TcFields[] {
  return testCases.map((testCase, index) => ({
    ...testCase,
    title: normalizeTestCaseTitle(testCase.title, index),
  }));
}
