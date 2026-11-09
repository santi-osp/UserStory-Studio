import { WorkItemFieldConfig, WorkItemFields } from '../models/types';
import {
  getAvailableRefinementFields,
  hasCompleteWorkItemContentMetadata,
  resolveWorkItemContentCapability,
  shouldIncludeAcceptanceCriteria,
} from './work-item-content-metadata';

describe('work-item-content-metadata', () => {
  const workItem = {
    title: 'Título',
    description: '<p>Descripción</p>',
    acceptanceCriteria: '<p>Criterio</p>',
  } as WorkItemFields;

  it('resolves supported from complete metadata with acceptance criteria', () => {
    const fields = completeFields(true);

    expect(hasCompleteWorkItemContentMetadata(fields)).toBeTrue();
    expect(resolveWorkItemContentCapability(fields, 'acceptanceCriteria')).toBe(
      'supported',
    );
    expect(getAvailableRefinementFields(fields, workItem, 'loaded')).toEqual([
      'title',
      'description',
      'acceptanceCriteria',
    ]);
  });

  it('resolves unsupported only from a complete contract without acceptance criteria', () => {
    const fields = completeFields(false);

    expect(resolveWorkItemContentCapability(fields, 'acceptanceCriteria')).toBe(
      'unsupported',
    );
    expect(getAvailableRefinementFields(fields, workItem, 'loaded')).toEqual([
      'title',
      'description',
    ]);
    expect(shouldIncludeAcceptanceCriteria(fields, workItem)).toBeFalse();
  });

  it('treats a legacy dynamic-only response as unknown and uses explicit payload fields', () => {
    const fields = [field('Prioridad', 'Microsoft.VSTS.Common.Priority')];

    expect(resolveWorkItemContentCapability(fields, 'acceptanceCriteria')).toBe(
      'unknown',
    );
    expect(getAvailableRefinementFields(fields, workItem, 'loaded')).toEqual([
      'title',
      'description',
      'acceptanceCriteria',
    ]);
    expect(shouldIncludeAcceptanceCriteria(fields, workItem)).toBeTrue();
  });

  it('does not invent acceptance criteria in a legacy payload that omits the property', () => {
    const legacyWorkItem = { ...workItem } as Partial<WorkItemFields>;
    delete legacyWorkItem.acceptanceCriteria;

    expect(
      getAvailableRefinementFields(
        [field('Prioridad', 'Microsoft.VSTS.Common.Priority')],
        legacyWorkItem as WorkItemFields,
        'loaded',
      ),
    ).toEqual(['title', 'description']);
    expect(
      shouldIncludeAcceptanceCriteria([], legacyWorkItem as WorkItemFields),
    ).toBeFalse();
  });

  it('keeps capability unknown while loading and after errors', () => {
    const fields = completeFields(true);

    expect(
      resolveWorkItemContentCapability(fields, 'acceptanceCriteria', 'loading'),
    ).toBe('unknown');
    expect(
      resolveWorkItemContentCapability(fields, 'acceptanceCriteria', 'error'),
    ).toBe('unknown');
  });

  it('matches referenceName case-insensitively and ignores labels', () => {
    const fields = [
      field('Otro', 'SYSTEM.TITLE'),
      field('Irrelevante', 'system.description'),
      field('Sin traducción', 'MICROSOFT.VSTS.COMMON.ACCEPTANCECRITERIA'),
    ];

    expect(resolveWorkItemContentCapability(fields, 'acceptanceCriteria')).toBe(
      'supported',
    );
  });

  function completeFields(
    withAcceptanceCriteria: boolean,
  ): WorkItemFieldConfig[] {
    return [
      field('Título', 'System.Title'),
      field('Descripción', 'System.Description'),
      ...(withAcceptanceCriteria
        ? [field('Criterios', 'Microsoft.VSTS.Common.AcceptanceCriteria')]
        : []),
    ];
  }

  function field(label: string, referenceName: string): WorkItemFieldConfig {
    return {
      name: label,
      referenceName,
      label,
      type: 'string',
      required: false,
      control: 'input',
      options: [],
    };
  }
});
