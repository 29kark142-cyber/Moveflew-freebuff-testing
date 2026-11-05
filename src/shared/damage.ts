// Pre-move damage inspection rules shared by the crew phone screen and the server.
// Photos live as `damage` workspace records with phase "pre"; the customer
// acknowledgment is stored on the job as `preMoveInspection`.

export const DAMAGE_ROOMS = [
  "Living room",
  "Bedroom",
  "Kitchen",
  "Bathroom",
  "Dining room",
  "Office",
  "Hallway / stairs",
  "Garage",
  "Exterior",
  "Other",
] as const;

export type DamagePhoto = {
  id: number;
  phase: "pre" | "post" | string;
  note: string;
  photoUrl: string;
  room?: string;
  item?: string;
  description?: string;
  at?: string;
};

export type PreMovePhotoMeta = { id: number; room: string; item: string; description: string };

export type PreMoveInspection = {
  signature: string;
  signedAt: string;
  by: string;
  photoCount: number;
  rooms: string[];
  photos: PreMovePhotoMeta[];
  statement: string;
};

/** The customer acknowledgment wording shown before any loading begins. */
export const PRE_MOVE_STATEMENT =
  "I have reviewed the photos and notes above with the crew. They record the condition of my property and belongings before loading started, and I confirm this is an accurate record of pre-existing damage.";

export const preMovePhotoMeta = (photo: DamagePhoto): PreMovePhotoMeta => ({
  id: photo.id,
  room: (photo.room ?? "").trim(),
  item: (photo.item ?? "").trim(),
  // Older photos only carry `note`; a blank description must still fall back to it.
  description: (photo.description ?? "").trim() || (photo.note ?? "").trim(),
});

/**
 * Pre-move inspection can only be signed before loading starts; after that the
 * loading crew could have caused the damage the customer is acknowledging.
 */
export function preMoveInspectionOpen(
  timeline: Record<string, string | undefined> | null | undefined,
): boolean {
  return !timeline?.start_loading;
}

export type PreMoveChecklist = {
  total: number;
  unlabelled: number;
  rooms: string[];
  ready: boolean;
};

/** Rooms must be recorded for every photo; the UI warns rather than blocking the signature. */
export function preMoveChecklist(photos: DamagePhoto[]): PreMoveChecklist {
  const pre = photos.filter((p) => p.phase === "pre");
  const rooms = [...new Set(pre.map((p) => (p.room ?? "").trim()).filter(Boolean))].sort();
  const unlabelled = pre.filter((p) => !(p.room ?? "").trim() || !(p.item ?? "").trim()).length;
  return { total: pre.length, unlabelled, rooms, ready: unlabelled === 0 };
}

export function preMoveSummaryLine(checklist: PreMoveChecklist): string {
  if (checklist.total === 0) return "No pre-existing damage recorded";
  const photos = `${checklist.total} photo${checklist.total === 1 ? "" : "s"}`;
  if (checklist.rooms.length === 0) return photos;
  return `${photos} across ${checklist.rooms.length} room${checklist.rooms.length === 1 ? "" : "s"}`;
}
