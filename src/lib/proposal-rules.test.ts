import { describe,it,expect } from 'vitest';
import { requiredDeposit,depositRuleSchema,quoteSchema } from './proposal-rules';
describe('workspace deposit rules',()=>{
  it('uses a fixed USD workspace amount',()=>expect(requiredDeposit(1000,{mode:'fixed',value:150})).toBe(15000));
  it('uses percentage of total estimate',()=>expect(requiredDeposit(1250,{mode:'percentage',value:20})).toBe(25000));
  it('office proposal override replaces the workspace rule',()=>expect(requiredDeposit(1250,{mode:'percentage',value:20},100)).toBe(10000));
  it('never invents an unconfigured deposit',()=>expect(()=>requiredDeposit(1000,null)).toThrow());
  it('prevents collecting more than the estimate',()=>expect(()=>requiredDeposit(100,{mode:'fixed',value:150})).toThrow());
  it('rejects percentages above 100',()=>expect(depositRuleSchema.safeParse({mode:'percentage',value:101}).success).toBe(false));
});
describe('website leads',()=>{
  it('validates incoming quote contact and move information',()=>{
    const quote={name:'Customer',email:'customer@example.com',phone:'3125550100',origin:'Chicago',destination:'Evanston',moveDate:'2026-11-10'};
    expect(quoteSchema.safeParse(quote).success).toBe(true);
    expect(quoteSchema.safeParse({...quote,email:'invalid'}).success).toBe(false);
  });
});