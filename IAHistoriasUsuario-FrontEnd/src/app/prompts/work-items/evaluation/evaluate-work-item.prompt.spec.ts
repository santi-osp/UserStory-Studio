import { buildEvaluateWorkItemPrompt } from './evaluate-work-item.prompt';

describe('evaluate-work-item.prompt', () => {
  it('builds the evaluation prompt from the frontend with the required structured sections', () => {
    const result = buildEvaluateWorkItemPrompt({
      workItemType: 'User Story',
      workItemId: 321,
      title: 'Registrar solicitudes',
    });

    expect(result.systemPrompt).toContain('JSON valido');
    expect(result.prompt).toContain('Tipo de work item objetivo: User Story');
    expect(result.prompt).toContain('claridad del rol');
    expect(result.prompt).toContain('"edgeCases": []');
    expect(result.prompt).toContain('"dependencies": []');
    expect(result.prompt).toContain('"dataValidations": []');
    expect(result.prompt).toContain('"securityConsiderations": []');
    expect(result.prompt).toContain('"observabilityConsiderations": []');
    expect(result.prompt).toContain('listo/no listo para desarrollo');
    expect(result.prompt).toContain('workItemId: 321');
    expect(result.prompt).toContain('Registrar solicitudes');
    expect(result.prompt).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it('adapts evaluation focus by work item type', () => {
    const epic = buildEvaluateWorkItemPrompt({
      workItemType: 'Epic',
      workItemId: 1,
      title: 'Transformacion comercial',
    }).prompt;
    const feature = buildEvaluateWorkItemPrompt({
      workItemType: 'Feature',
      workItemId: 2,
      title: 'Gestion de solicitudes',
    }).prompt;

    expect(epic).toContain('objetivo estrategico');
    expect(epic).toContain('descomposición necesaria');
    expect(feature).toContain('relacion con Epic si existe');
    expect(feature).toContain('posibilidad de descomposición');
    expect(epic).not.toContain('testCases');
    expect(feature).not.toContain('testSuite');
  });

  it('rejects unknown work item types', () => {
    expect(() =>
      buildEvaluateWorkItemPrompt({ workItemType: 'Bug' }),
    ).toThrowError(/no es válido/);
  });
});
