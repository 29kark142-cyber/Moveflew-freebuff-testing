import { z } from 'zod';

export const DOCUMENT_TITLES = { bol: 'Bill of Lading', damage: 'Pre-Existing Damage Waiver', inspection: 'Furniture Inspection Checklist' } as const;
export type DocumentKind = keyof typeof DOCUMENT_TITLES;
export const DAMAGE_TERMS = 'The customer and crew acknowledge the pre-existing conditions recorded below and in the inspection photos. This acknowledgment does not waive liability for new damage, negligence, or rights provided by applicable law.';
export const BOL_TERMS = 'The customer acknowledges the shipment, route, service times, inventory, recorded conditions, and charges shown in this Bill of Lading. Customer signature records receipt of the completed services and does not alter the agreed estimate or applicable legal rights.';
export const inspectionItemSchema = z.object({ id: z.string().min(1).max(80), item: z.string().trim().min(1).max(120), condition: z.enum(['good','scratched','dented','other']), notes: z.string().max(1000).default('') });
export const documentSchema = z.object({ kind: z.enum(['bol','damage','inspection']), notes: z.string().max(5000).default(''), items: z.array(inspectionItemSchema).max(200).default([]), signature: z.string().regex(/^data:image\/png;base64,iVBOR/).min(100).max(400000).nullable().default(null) });
export type FieldDocument = z.infer<typeof documentSchema> & { signedAt?: string; by?: string };
export type FieldDocuments = Partial<Record<DocumentKind, FieldDocument>>;
export const operationSchema = z.string().uuid();
export type FieldSnapshot = { company: { name: string; officeEmail: string; phone: string }; job: Record<string, unknown>; documents: FieldDocuments; photos: { note: string; phase: string; photoUrl: string }[]; signature: string; signedAt: string; by: string };