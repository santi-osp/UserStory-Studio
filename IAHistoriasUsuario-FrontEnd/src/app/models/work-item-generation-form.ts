import { FormControl } from '@angular/forms';

export type TestCaseQuantityMode = 'fixed' | 'ai';
export type CatalogLoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface WorkItemDestinationControls {
  project: FormControl<string | null>;
  areaPath: FormControl<string | null>;
  iterationPath: FormControl<string | null>;
  workItemType: FormControl<string | null>;
}

export interface TestCaseGenerationControls {
  enabled: FormControl<boolean | null>;
  quantityMode: FormControl<TestCaseQuantityMode>;
  quantity: FormControl<number | null>;
  state: FormControl<string | null>;
  testPlanId: FormControl<number | null>;
}

export interface CatalogValidationContext<T> {
  state: CatalogLoadState;
  options: readonly T[];
}
