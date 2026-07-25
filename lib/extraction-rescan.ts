/** Max times the user can re-run vision extract on the same receipt photo. */
export const MAX_EXTRACTION_RESCANS = 2;

export function rescansRemaining(rescansUsed: number): number {
  return Math.max(0, MAX_EXTRACTION_RESCANS - Math.max(0, rescansUsed));
}

export function canRescanExtraction(
  warningCount: number,
  rescansUsed: number,
  hasReceiptImage: boolean
): boolean {
  return (
    warningCount > 0 &&
    hasReceiptImage &&
    rescansRemaining(rescansUsed) > 0
  );
}
