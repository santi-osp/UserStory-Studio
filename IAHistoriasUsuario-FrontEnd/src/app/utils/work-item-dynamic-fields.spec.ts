import { FormGroup } from '@angular/forms';
import { WorkItemFieldConfig, WorkItemPayload } from '../models/types';
import {
  collectSanitizedDynamicWorkItemFields,
  restoreUserControlledWorkItemFieldsFromBase,
  sanitizeWorkItemPayload,
  shouldRenderDynamicWorkItemField,
  syncDynamicWorkItemControls,
  BUILDER_DYNAMIC_CONTROL_PREFIX,
  dynamicWorkItemControlName,
  getMissingRequiredDynamicWorkItemFields,
} from './work-item-dynamic-fields';

describe('work-item-dynamic-fields sanitization', () => {
  const payload: WorkItemPayload = {
    azdoOrg: 'org',
    azdoProject: 'project',
    iterationPath: 'project\\sprint',
    areaPath: 'project\\area',
    workItemType: 'Epic',
    workItem: {
      title: 'Epic',
      description: '<p>Descripcion</p>',
      acceptanceCriteria: '<p>No aplica</p>',
      priority: '',
      risk: '',
      startDate: '',
      finishDate: '',
      valueArea: '',
      tipoHU: '',
      frenteDeTrabajo: '',
      assignedTo: '',
      valueArea2: 'Architectural',
    },
    testCases: [
      {
        title: 'TC 1 - A',
        state: 'Ready',
        steps: [{ action: 'a', expected: 'e' }],
      },
    ],
    testSuite: { planId: 10 },
  };

  it('removes fields that are not allowed by metadata and strips unsupported test cases', () => {
    const result = sanitizeWorkItemPayload(payload, [
      createField('title', 'System.Title', true),
      createField('description', 'System.Description', true),
      createField('businessValue', 'Microsoft.VSTS.Common.BusinessValue'),
    ]);

    expect(result.payload.workItem.title).toBe('Epic');
    expect(result.payload.workItem.description).toBe('<p>Descripcion</p>');
    expect(result.payload.workItem.acceptanceCriteria).toBeUndefined();
    expect(result.payload.workItem['valueArea2']).toBeUndefined();
    expect(result.payload.testCases).toEqual([]);
    expect(result.payload.testSuite).toEqual({ planId: 0 });
    expect(result.removedFields).toEqual(
      jasmine.arrayContaining(['acceptanceCriteria', 'valueArea2']),
    );
  });

  it('keeps acceptance criteria when the selected type metadata supports it', () => {
    const result = sanitizeWorkItemPayload(
      { ...payload, workItemType: 'User Story' },
      [
        createField('title', 'System.Title', true),
        createField('description', 'System.Description', true),
        createField(
          'acceptanceCriteria',
          'Microsoft.VSTS.Common.AcceptanceCriteria',
        ),
      ],
    );

    expect(result.payload.workItem.acceptanceCriteria).toBe('<p>No aplica</p>');
    expect(result.payload.testCases.length).toBe(1);
    expect(result.payload.testSuite).toEqual({ planId: 10 });
  });

  it('lets complete metadata override the legacy User Story acceptance-criteria fallback', () => {
    const result = sanitizeWorkItemPayload(
      { ...payload, workItemType: 'User Story' },
      [
        createField('Title', 'System.Title', true, true),
        createField('Description', 'System.Description', false, true),
        createField('Value Area', 'Microsoft.VSTS.Common.ValueArea'),
      ],
    );

    expect(result.payload.workItem.title).toBe('Epic');
    expect(result.payload.workItem.description).toBe('<p>Descripcion</p>');
    expect(result.payload.workItem.acceptanceCriteria).toBeUndefined();
    expect(result.removedFields).not.toContain('title');
    expect(result.removedFields).not.toContain('description');
    expect(result.removedFields).toContain('acceptanceCriteria');
    expect(result.removedFields).toContain('valueArea2');
  });

  it('keeps explicit acceptance criteria for a legacy dynamic-only response', () => {
    const result = sanitizeWorkItemPayload(
      { ...payload, workItemType: 'Custom Requirement' },
      [createField('Priority', 'Microsoft.VSTS.Common.Priority')],
    );

    expect(result.payload.workItem.acceptanceCriteria).toBe('<p>No aplica</p>');
  });

  it('keeps acceptance criteria for a custom type when complete metadata supports it', () => {
    const result = sanitizeWorkItemPayload(
      { ...payload, workItemType: 'Custom Requirement' },
      [
        createField('Title', 'System.Title', true),
        createField('Description', 'System.Description', true),
        createField(
          'Acceptance Criteria',
          'Microsoft.VSTS.Common.AcceptanceCriteria',
        ),
      ],
    );

    expect(result.payload.workItem.acceptanceCriteria).toBe('<p>No aplica</p>');
  });

  it('reports required fields without silently removing them', () => {
    const result = sanitizeWorkItemPayload(
      {
        ...payload,
        workItem: {
          ...payload.workItem,
          title: '',
        },
      },
      [
        createField('title', 'System.Title', true),
        createField('description', 'System.Description', true),
      ],
    );

    expect(result.payload.workItem.title).toBe('');
    expect(result.missingRequiredFields).toEqual(['title']);
  });

  it('keeps required User Story Value Area when test suite is selected', () => {
    const result = sanitizeWorkItemPayload(
      {
        ...payload,
        workItemType: 'User Story',
        workItem: {
          ...payload.workItem,
          title: 'Historia',
          description: '<p>Descripcion</p>',
          acceptanceCriteria: '<p>Criterios</p>',
          valueArea: '',
          'Value Area': 'Negocio',
        },
        testSuite: { planId: 10 },
      },
      [
        createField('Title', 'System.Title', true),
        createField('Description', 'System.Description', true),
        createField('Value Area', 'Microsoft.VSTS.Common.ValueArea', true),
        createField(
          'Acceptance Criteria',
          'Microsoft.VSTS.Common.AcceptanceCriteria',
        ),
      ],
    );

    expect(result.payload.workItem.valueArea).toBe('Negocio');
    expect(result.payload.workItem['Value Area']).toBeUndefined();
    expect(result.payload.testSuite).toEqual({ planId: 10 });
    expect(result.missingRequiredFields).toEqual([]);
    expect(result.removedFields).not.toContain('Value Area');
  });

  it('reports required User Story Value Area when it is missing', () => {
    const result = sanitizeWorkItemPayload(
      {
        ...payload,
        workItemType: 'User Story',
        workItem: {
          ...payload.workItem,
          title: 'Historia',
          description: '<p>Descripcion</p>',
          acceptanceCriteria: '<p>Criterios</p>',
          valueArea: '',
        },
      },
      [
        createField('Title', 'System.Title', true),
        createField('Description', 'System.Description', true),
        createField('Value Area', 'Microsoft.VSTS.Common.ValueArea', true),
        createField(
          'Acceptance Criteria',
          'Microsoft.VSTS.Common.AcceptanceCriteria',
        ),
      ],
    );

    expect(result.payload.workItem.valueArea).toBe('');
    expect(result.missingRequiredFields).toEqual(['Value Area']);
  });

  it('restores user controlled Business Value without treating it as Value Area', () => {
    const result = restoreUserControlledWorkItemFieldsFromBase(
      {
        ...payload.workItem,
        title: 'Epic generado',
        description: '<p>Descripcion generada</p>',
        valueArea: '',
      },
      {
        ...payload.workItem,
        title: 'Epic base',
        description: '<p>Descripcion base</p>',
        businessValue: 'Negocio',
      },
      [
        createField('Title', 'System.Title', true),
        createField('Description', 'System.Description', true),
        createField(
          'Business Value',
          'Microsoft.VSTS.Common.BusinessValue',
          true,
        ),
      ],
      ['title', 'description', 'acceptanceCriteria'],
      { workItemType: 'Epic' },
    );

    expect(result.title).toBe('Epic generado');
    expect(result.description).toBe('<p>Descripcion generada</p>');
    expect(result['businessValue']).toBe('Negocio');
    expect(result.valueArea).toBe('');
    expect(result['Business Value']).toBeUndefined();
  });

  it('restores dynamic control values from canonical pending payload keys', () => {
    const form = new FormGroup({});
    const valueAreaField = createField(
      'Value Area',
      'Microsoft.VSTS.Common.ValueArea',
      true,
    );
    const businessValueField = createField(
      'Business Value',
      'Microsoft.VSTS.Common.BusinessValue',
      true,
    );

    syncDynamicWorkItemControls(
      form,
      [valueAreaField, businessValueField],
      BUILDER_DYNAMIC_CONTROL_PREFIX,
      {
        valueArea: 'Negocio',
        businessValue: 10,
      },
    );

    expect(
      form.get(
        dynamicWorkItemControlName(
          valueAreaField,
          BUILDER_DYNAMIC_CONTROL_PREFIX,
        ),
      )?.value,
    ).toBe('Negocio');
    expect(
      form.get(
        dynamicWorkItemControlName(
          businessValueField,
          BUILDER_DYNAMIC_CONTROL_PREFIX,
        ),
      )?.value,
    ).toBe(10);
  });

  it('uses referenceName to keep Value Area and Business Value controls separate when names collide', () => {
    const form = new FormGroup({});
    const valueAreaField = createField(
      'valueArea',
      'Microsoft.VSTS.Common.ValueArea',
      true,
    );
    const businessValueField = createField(
      'valueArea',
      'Microsoft.VSTS.Common.BusinessValue',
      true,
    );

    syncDynamicWorkItemControls(
      form,
      [valueAreaField, businessValueField],
      BUILDER_DYNAMIC_CONTROL_PREFIX,
      {},
    );
    form
      .get(
        dynamicWorkItemControlName(
          valueAreaField,
          BUILDER_DYNAMIC_CONTROL_PREFIX,
        ),
      )
      ?.setValue('Negocio');
    form
      .get(
        dynamicWorkItemControlName(
          businessValueField,
          BUILDER_DYNAMIC_CONTROL_PREFIX,
        ),
      )
      ?.setValue(10);

    const result = collectSanitizedDynamicWorkItemFields(
      form,
      [valueAreaField, businessValueField],
      BUILDER_DYNAMIC_CONTROL_PREFIX,
      'Epic',
    );

    expect(result.workItem.valueArea).toBe('Negocio');
    expect(result.workItem['businessValue']).toBe(10);
    expect(Object.keys(form.controls)).toEqual(
      jasmine.arrayContaining([
        `${BUILDER_DYNAMIC_CONTROL_PREFIX}valuearea`,
        `${BUILDER_DYNAMIC_CONTROL_PREFIX}businessvalue`,
      ]),
    );
  });

  it('keeps canonical content fields out of dynamic form controls', () => {
    expect(
      shouldRenderDynamicWorkItemField(
        createField('Titulo localizado', 'System.Title'),
      ),
    ).toBeFalse();
    expect(
      shouldRenderDynamicWorkItemField(
        createField('Descripcion localizada', 'System.Description'),
      ),
    ).toBeFalse();
    expect(
      shouldRenderDynamicWorkItemField(
        createField(
          'Criterios localizados',
          'Microsoft.VSTS.Common.AcceptanceCriteria',
        ),
      ),
    ).toBeFalse();
    expect(
      shouldRenderDynamicWorkItemField(
        createField('Prioridad', 'Microsoft.VSTS.Common.Priority'),
      ),
    ).toBeTrue();
  });

  it('returns missing required dynamic fields with their exact referenceName', () => {
    const form = new FormGroup({});
    const fields = [
      createField('Etiqueta duplicada', 'Custom.First', true),
      createField('Etiqueta duplicada', 'Custom.Second', true),
    ];
    syncDynamicWorkItemControls(
      form,
      fields,
      BUILDER_DYNAMIC_CONTROL_PREFIX,
      {},
    );
    form
      .get(
        dynamicWorkItemControlName(fields[0], BUILDER_DYNAMIC_CONTROL_PREFIX),
      )
      ?.setValue('Completo');

    expect(
      getMissingRequiredDynamicWorkItemFields(
        form,
        fields,
        BUILDER_DYNAMIC_CONTROL_PREFIX,
      ).map((field) => field.referenceName),
    ).toEqual(['Custom.Second']);
  });
});

function createField(
  name: string,
  referenceName: string,
  required = false,
  isReadOnly = false,
): WorkItemFieldConfig {
  return {
    name,
    referenceName,
    label: name,
    type: 'string',
    required,
    control: 'input',
    options: [],
    isReadOnly,
  };
}
