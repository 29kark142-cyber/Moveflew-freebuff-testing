import {describe,expect,it} from 'vitest';
import {documentSchema} from './field-documents';
describe('field document validation',()=>{
 it('accepts each required template and inspection condition',()=>{for(const kind of ['bol','damage','inspection'])expect(documentSchema.parse({kind,items:[{id:'a',item:'Dresser',condition:'scratched',notes:'Top surface'}]}).items[0].condition).toBe('scratched');});
 it('rejects arbitrary documents and invalid signatures',()=>{expect(documentSchema.safeParse({kind:'other'}).success).toBe(false);expect(documentSchema.safeParse({kind:'bol',signature:'not-a-signature'}).success).toBe(false);});
});