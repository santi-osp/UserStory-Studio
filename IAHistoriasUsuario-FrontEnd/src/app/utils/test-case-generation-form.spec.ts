import { FormControl } from '@angular/forms';
import {
  configureTestCaseCountControl,
  configureTestPlanControl,
  mapTestPlanIdForPayload,
  normalizeTestCaseCount,
  normalizeTestPlanId,
  testPlanExistsInOptionsValidator,
} from './test-case-generation-form';

describe('test case generation form contract', () => {
  const options = [{ id: 10, name: 'Plan QA' }];

  it('uses null as the only empty Test Plan value', () => {
    expect(normalizeTestPlanId(null)).toBeNull();
    expect(normalizeTestPlanId('')).toBeNull();
    expect(normalizeTestPlanId(0)).toBeNull();
    expect(normalizeTestPlanId(-1)).toBeNull();
    expect(normalizeTestPlanId(10)).toBe(10);
  });

  it('validates an id against the current successful catalog', () => {
    const context = { state: 'ready' as const, options };
    const validator = testPlanExistsInOptionsValidator(() => context);
    expect(validator(new FormControl(10))).toBeNull();
    expect(validator(new FormControl(11))).toEqual({
      testPlanNotInCatalog: true,
    });
    expect(validator(new FormControl(null))).toEqual({ required: true });
  });

  it('does not show a premature required error while loading', () => {
    const validator = testPlanExistsInOptionsValidator(() => ({
      state: 'loading',
      options: [],
    }));
    expect(validator(new FormControl(null))).toBeNull();
  });

  it('disables and clears Test Plan when Test Cases are inactive', () => {
    const control = new FormControl<number | null>(10);
    configureTestPlanControl(control, false, () => ({
      state: 'ready',
      options,
    }));
    expect(control.disabled).toBeTrue();
    expect(control.value).toBeNull();
  });

  it('maps zero only at the disabled payload boundary', () => {
    expect(mapTestPlanIdForPayload(false, null, [])).toBe(0);
    expect(mapTestPlanIdForPayload(true, 10, options)).toBe(10);
    expect(() => mapTestPlanIdForPayload(true, 0, options)).toThrowError();
    expect(() => mapTestPlanIdForPayload(true, 11, options)).toThrowError();
  });

  it('keeps the existing Test Case quantity bounds', () => {
    expect(normalizeTestCaseCount(-1)).toBe(0);
    expect(normalizeTestCaseCount(2.9)).toBe(2);
    expect(normalizeTestCaseCount(80)).toBe(50);
  });

  it('rejects non-numeric and fractional Test Plan ids', () => {
    expect(normalizeTestPlanId('abc')).toBeNull();
    expect(normalizeTestPlanId(1.5)).toBeNull();
  });

  it('treats zero and negative ids as invalid in an active catalog', () => {
    const validator = testPlanExistsInOptionsValidator(() => ({
      state: 'ready',
      options,
    }));
    expect(validator(new FormControl(0))).toEqual({ required: true });
    expect(validator(new FormControl(-4))).toEqual({ required: true });
  });

  it('does not require a plan while the catalog is idle', () => {
    const control = new FormControl<number | null>(null);
    configureTestPlanControl(control, true, () => ({
      state: 'idle',
      options: [],
    }));
    expect(control.enabled).toBeTrue();
    expect(control.errors).toBeNull();
  });

  it('requires a plan when the catalog is empty', () => {
    const control = new FormControl<number | null>(null);
    configureTestPlanControl(control, true, () => ({
      state: 'empty',
      options: [],
    }));
    expect(control.errors).toEqual({ required: true });
  });

  it('marks a missing plan unavailable when catalog loading failed', () => {
    const validator = testPlanExistsInOptionsValidator(() => ({
      state: 'error',
      options: [],
    }));
    expect(validator(new FormControl(null))).toEqual({
      testPlanUnavailable: true,
    });
  });

  it('invalidates a selection when a refreshed catalog no longer contains it', () => {
    const context = { state: 'ready' as const, options: [...options] };
    const control = new FormControl<number | null>(10);
    configureTestPlanControl(control, true, () => context);
    expect(control.valid).toBeTrue();
    context.options = [];
    control.updateValueAndValidity();
    expect(control.errors).toEqual({ testPlanNotInCatalog: true });
  });

  it('keeps a valid active selection as a positive id', () => {
    const control = new FormControl<number | null>(10);
    configureTestPlanControl(control, true, () => ({
      state: 'ready',
      options,
    }));
    expect(control.enabled).toBeTrue();
    expect(control.value).toBe(10);
    expect(control.valid).toBeTrue();
  });

  it('enables and validates a fixed Test Case quantity', () => {
    const control = new FormControl<number | null>(0);
    configureTestCaseCountControl(control, true);
    expect(control.enabled).toBeTrue();
    expect(control.invalid).toBeTrue();
    control.setValue(3);
    expect(control.valid).toBeTrue();
  });

  it('disables quantity validation when fixed quantity is inactive', () => {
    const control = new FormControl<number | null>(0);
    configureTestCaseCountControl(control, false);
    expect(control.disabled).toBeTrue();
    expect(control.errors).toBeNull();
  });
});
