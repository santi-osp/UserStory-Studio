import {
  normalizeTestCaseTitle,
  normalizeTestCaseTitles,
  stripTestCaseNumberPrefix,
} from './test-case-title';

describe('test-case-title utilities', () => {
  it('should strip known numbering prefixes', () => {
    expect(stripTestCaseNumberPrefix('TC1 - Validar login')).toBe(
      'Validar login',
    );
    expect(stripTestCaseNumberPrefix('TC 2 - Validar error')).toBe(
      'Validar error',
    );
    expect(stripTestCaseNumberPrefix('Caso de prueba 3 - Validar campos')).toBe(
      'Validar campos',
    );
  });

  it('should normalize titles with contiguous numbering', () => {
    const normalized = normalizeTestCaseTitles([
      {
        title: 'TC 1 - A',
        state: 'Ready',
        steps: [{ action: 'a', expected: 'e' }],
      },
      {
        title: 'Caso de prueba 9 - B',
        state: 'Ready',
        steps: [{ action: 'a', expected: 'e' }],
      },
      { title: 'C', state: 'Ready', steps: [{ action: 'a', expected: 'e' }] },
    ]);

    expect(normalized.map((item) => item.title)).toEqual([
      'TC 1 - A',
      'TC 2 - B',
      'TC 3 - C',
    ]);
  });

  it('should provide fallback suffix when title is empty', () => {
    expect(normalizeTestCaseTitle('', 1)).toBe('TC 2 - Caso de prueba');
  });
});
