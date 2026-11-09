import {
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { CatalogValidationContext } from '../models/work-item-generation-form';
import { TestPlanSummary } from '../models/types';

export const TEST_CASE_COUNT_MIN = 1;
export const TEST_CASE_COUNT_MAX = 50;

export function normalizeTestCaseCount(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(TEST_CASE_COUNT_MAX, Math.floor(numericValue)));
}

export function normalizeTestPlanId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0
    ? numericValue
    : null;
}

export function testPlanExistsInOptionsValidator(
  getContext: () => CatalogValidationContext<TestPlanSummary>,
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const context = getContext();
    if (context.state === 'idle' || context.state === 'loading') {
      return null;
    }

    const planId = normalizeTestPlanId(control.value);
    if (planId === null) {
      return context.state === 'ready' || context.state === 'empty'
        ? { required: true }
        : { testPlanUnavailable: true };
    }

    return context.state === 'ready' &&
      context.options.some((option) => option.id === planId)
      ? null
      : { testPlanNotInCatalog: true };
  };
}

export function configureTestPlanControl(
  control: AbstractControl,
  enabled: boolean,
  getContext: () => CatalogValidationContext<TestPlanSummary>,
): void {
  if (!enabled) {
    control.clearValidators();
    control.setValue(null, { emitEvent: false });
    control.disable({ emitEvent: false });
    control.setErrors(null);
    return;
  }

  control.enable({ emitEvent: false });
  const context = getContext();
  control.setValidators([
    ...(context.state === 'ready' || context.state === 'empty'
      ? [Validators.required]
      : []),
    testPlanExistsInOptionsValidator(getContext),
  ]);
  control.updateValueAndValidity({ emitEvent: false });
}

export function configureTestCaseCountControl(
  control: AbstractControl,
  enabled: boolean,
): void {
  if (!enabled) {
    control.clearValidators();
    control.disable({ emitEvent: false });
    control.setErrors(null);
    return;
  }

  control.enable({ emitEvent: false });
  control.setValidators([
    Validators.required,
    Validators.min(TEST_CASE_COUNT_MIN),
    Validators.max(TEST_CASE_COUNT_MAX),
    Validators.pattern(/^\d+$/),
  ]);
  control.updateValueAndValidity({ emitEvent: false });
}

export function mapTestPlanIdForPayload(
  testCasesEnabled: boolean,
  value: unknown,
  options: readonly TestPlanSummary[],
): number {
  if (!testCasesEnabled) {
    return 0;
  }

  const planId = normalizeTestPlanId(value);
  if (planId === null || !options.some((option) => option.id === planId)) {
    throw new Error(
      'Selecciona un Test Plan disponible para el proyecto actual.',
    );
  }

  return planId;
}
