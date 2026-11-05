import { expect, it } from 'vitest';
import { hasSignatureStroke } from './signature-stroke';
it('rejects taps and blank signature captures', () => {
  expect(hasSignatureStroke(0)).toBe(false);
  expect(hasSignatureStroke(7)).toBe(false);
  expect(hasSignatureStroke(8)).toBe(true);
});