import { expect, it } from 'vitest';
import { canEditTariffs, pricingSchema } from './workspace-tariffs';
import { DEFAULT_PRICING } from './crm';
it('only admins edit tariffs', () => {
  expect(canEditTariffs('admin')).toBe(true);
  for (const role of ['office_admin', 'dispatcher', 'estimator', 'crew', null]) expect(canEditTariffs(role)).toBe(false);
});
it('stores labor, minimum hours and truck fees with concrete validation bounds', () => {
  const settings = { ...DEFAULT_PRICING, rates: [90, 160], minimumHours: 3, truckFee: 75 };
  expect(pricingSchema.parse(settings).truckFee).toBe(75);
  expect(pricingSchema.parse(settings).rates).toEqual([90, 160]);
  expect(pricingSchema.safeParse({ ...settings, minimumHours: -1 }).success).toBe(false);
  expect(pricingSchema.safeParse({ ...settings, truckFee: -1 }).success).toBe(false);
});