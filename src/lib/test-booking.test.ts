import { describe, expect, it } from 'vitest';
import { canTestBook } from './test-booking';

describe('preview-only admin manual booking', () => {
  it('allows admins on preview without a payment requirement', () => {
    expect(canTestBook('id-preview--460062b7-cfc0-4922-8d98-02dcb2768252.lovable.app', 'admin')).toBe(true);
    expect(canTestBook('localhost', 'office_admin')).toBe(true);
  });
  it('rejects published hosts and lookalike hosts', () => {
    expect(canTestBook('manus-to-makeover.lovable.app', 'admin')).toBe(false);
    expect(canTestBook('id-preview--attacker.example', 'admin')).toBe(false);
  });
  it('rejects non-admin workspace roles', () => {
    for (const role of ['crew', 'dispatcher', 'estimator', null]) expect(canTestBook('localhost', role)).toBe(false);
  });
});