import {
  buildRefineTestCasesPrompt,
  TEST_CASE_STATE_TRANSPORT_MARKER,
} from './refine-test-cases.prompt';

describe('buildRefineTestCasesPrompt', () => {
  it('sends only selected content with stable refs and no project state or unselected cases', () => {
    const result = buildRefineTestCasesPrompt({
      workItemType: 'User Story',
      title: 'Comprar producto',
      description: 'Flujo de compra',
      acceptanceCriteria: 'Pago aprobado',
      mode: 'improve',
      selectedTestCases: [
        {
          ref: 'tc-2',
          position: 1,
          title: 'Pagar',
          steps: [{ action: 'Enviar pago', expected: 'Aprobado' }],
        },
      ],
      instructions: 'Hacer verificable',
    });

    expect(result.prompt).toContain('[tc-2] Pagar');
    expect(result.prompt).toContain('Cantidad exacta: 1');
    expect(result.prompt).toContain(TEST_CASE_STATE_TRANSPORT_MARKER);
    expect(result.prompt).not.toContain('Ready');
    expect(result.prompt).not.toContain('azdoProject');
    expect(result.prompt).not.toContain('testSuite');
  });

  it('uses exclusive regenerate rules for User Story', () => {
    const result = buildRefineTestCasesPrompt({
      workItemType: 'User Story',
      title: 'Fallo',
      description: 'Detalle',
      mode: 'regenerate',
      selectedTestCases: [{ ref: 'tc-1', position: 0, title: 'Caso', steps: [{ action: 'A', expected: 'E' }] }],
      instructions: 'Nuevo escenario',
    });
    expect(result.prompt).toContain('Modo: regenerar');
    expect(result.prompt).toContain('Reemplaza completamente');
    expect(result.prompt).not.toContain('Conserva el escenario central');
  });

  it('rejects Epic, Feature and unknown types', () => {
    for (const workItemType of ['Epic', 'Feature', 'Bug']) {
      expect(() =>
        buildRefineTestCasesPrompt({
          workItemType,
          title: 'Título',
          description: 'Detalle',
          mode: 'regenerate',
          selectedTestCases: [{ ref: 'tc-1', position: 0, title: 'Caso', steps: [{ action: 'A', expected: 'E' }] }],
          instructions: 'Nuevo escenario',
        }),
      ).toThrow();
    }
  });
});
