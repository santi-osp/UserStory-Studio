export const AZDO_TEST_CASE_WORK_ITEM_TYPE = 'Test Case';
export const AZDO_STATE_REFERENCE_NAME = 'System.State';
export const PREFERRED_TEST_CASE_STATE = 'Ready';

export function selectTestCaseState(
  options: string[],
  current: unknown,
): string {
  const validOptions = options.map((option) => option.trim()).filter(Boolean);
  const normalizedCurrent = String(current ?? '').trim();
  return (
    validOptions.find(
      (option) => option.toLowerCase() === normalizedCurrent.toLowerCase(),
    ) ??
    validOptions.find(
      (option) =>
        option.toLowerCase() === PREFERRED_TEST_CASE_STATE.toLowerCase(),
    ) ??
    validOptions[0] ??
    ''
  );
}
