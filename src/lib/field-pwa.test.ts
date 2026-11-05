import {describe,expect,it} from 'vitest';
import {refusesFieldWorker} from './field-pwa';
describe('field PWA preview safety',()=>{
 it('never registers in editor previews, drafts, development, iframe or kill-switch contexts',()=>{for(const h of ['id-preview--460062b7.lovable.app','preview-v2--460062b7.lovable.app','project--460062b7-dev.lovable.app','draft.lovableproject-dev.com','beta.lovable.dev'])expect(refusesFieldWorker(h,true,false,false)).toBe(true);expect(refusesFieldWorker('manus-to-makeover.lovable.app',false,false,false)).toBe(true);expect(refusesFieldWorker('manus-to-makeover.lovable.app',true,true,false)).toBe(true);expect(refusesFieldWorker('manus-to-makeover.lovable.app',true,false,true)).toBe(true);});
 it('permits published app and custom domains',()=>{expect(refusesFieldWorker('manus-to-makeover.lovable.app',true,false,false)).toBe(false);expect(refusesFieldWorker('preview-v2--shop.example.com',true,false,false)).toBe(false);});
});