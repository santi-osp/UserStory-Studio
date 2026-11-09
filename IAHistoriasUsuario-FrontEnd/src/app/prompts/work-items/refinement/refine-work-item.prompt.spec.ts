import { buildRefineWorkItemPrompt } from './refine-work-item.prompt';

describe('refine-work-item.prompt', () => {
  it('builds a dynamic contract with only supported content fields', () => {
    const result = buildRefineWorkItemPrompt({
      workItemType: 'Feature',
      supportedFields: ['title', 'description'],
      selectedFields: ['description'],
      currentContent: {
        title: 'Gestion de solicitudes',
        description: '<p>Permite gestionar solicitudes.</p>',
      },
      instructions: 'Agregar mayor detalle.',
    });

    expect(result.systemPrompt).toContain(
      'analista funcional y tecnico senior',
    );
    expect(result.prompt).toContain('Tipo real del Work Item: Feature');
    expect(result.prompt).toContain(
      'Campos seleccionados para refinar: description',
    );
    expect(result.prompt).toContain(
      'Campos que debes conservar exactamente: title',
    );
    expect(result.prompt).toContain('"title"');
    expect(result.prompt).toContain('"description"');
    expect(result.prompt).not.toContain('acceptanceCriteria');
    expect(result.prompt).not.toContain('changedFields":');
  });

  it('includes acceptance criteria only when metadata reports it as supported', () => {
    const result = buildRefineWorkItemPrompt({
      workItemType: 'User Story',
      supportedFields: ['title', 'description', 'acceptanceCriteria'],
      selectedFields: ['title', 'description', 'acceptanceCriteria'],
      currentContent: {
        title: 'Registrar solicitud',
        description: '<p>Como usuario...</p>',
        acceptanceCriteria: '<ul><li>Debe validar datos.</li></ul>',
      },
      instructions: 'Eliminar ambigüedades.',
    });

    expect(result.prompt).toContain('acceptanceCriteria');
    expect(result.prompt).toContain('HTML compatible con Azure DevOps');
    expect(result.prompt).toContain('No modifiques Value Area');
    expect(result.prompt).toContain('Devuelve unicamente JSON valido');
  });
});
