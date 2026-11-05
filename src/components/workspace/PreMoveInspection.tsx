import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ImagePlus,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import SignaturePad from "@/components/workspace/SignaturePad";
import { crmFetch } from "@/lib/crm";
import { cacheField, type FieldOperation, type FieldScope } from "@/lib/field-offline";
import { shrinkImage } from "@/lib/photo";
import {
  DAMAGE_ROOMS,
  PRE_MOVE_STATEMENT,
  preMoveChecklist,
  preMovePhotoMeta,
  preMoveSummaryLine,
  type DamagePhoto,
  type PreMoveInspection as PreMoveRecord,
} from "@shared/damage";

type Props = {
  jobId: number;
  photos: DamagePhoto[];
  setPhotos: Dispatch<SetStateAction<DamagePhoto[]>>;
  scope: FieldScope;
  locked: boolean;
  loadingStarted: boolean;
  saved: PreMoveRecord | null | undefined;
  queue: (
    jobId: number,
    action: FieldOperation["action"],
    body: Record<string, unknown>,
  ) => Promise<void>;
  onSaved: (record: PreMoveRecord) => void;
};

const inputClass =
  "h-12 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground";

export default function PreMoveInspection({
  jobId,
  photos,
  setPhotos,
  scope,
  locked,
  loadingStarted,
  saved,
  queue,
  onSaved,
}: Props) {
  const [room, setRoom] = useState<string>(DAMAGE_ROOMS[0]);
  const [item, setItem] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const prePhotos = useMemo(() => photos.filter((photo) => photo.phase === "pre"), [photos]);
  const checklist = useMemo(() => preMoveChecklist(photos), [photos]);
  const closed = Boolean(saved) || loadingStarted || locked;
  const canCapture = !closed && room.trim().length > 0 && item.trim().length > 0 && !busy;

  const capture = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const photoData = await shrinkImage(file);
      const meta = { room: room.trim(), item: item.trim(), description: description.trim() };
      const body = {
        photoData,
        room: meta.room,
        item: meta.item,
        description: meta.description,
        note: meta.description,
        phase: "pre" as const,
        operationId: crypto.randomUUID(),
      };
      try {
        await crmFetch(`/field/jobs/${jobId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const fresh = await crmFetch<DamagePhoto[]>(`/field/jobs/${jobId}/photos`);
        setPhotos(fresh);
        await cacheField(scope, `photos:${jobId}`, fresh);
        toast.success("Pre-move photo added to the job");
      } catch (reason) {
        if (navigator.onLine && !(reason instanceof TypeError)) throw reason;
        await queue(jobId, "photos", body);
        const optimistic: DamagePhoto[] = [
          ...photos,
          {
            id: -Date.now(),
            phase: "pre",
            note: meta.description,
            photoUrl: photoData,
            room: meta.room,
            item: meta.item,
            description: meta.description,
          },
        ];
        setPhotos(optimistic);
        await cacheField(scope, `photos:${jobId}`, optimistic);
        toast("Photo saved on this phone — it will sync when you're back online.");
      }
      setDescription("");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save that photo");
    } finally {
      setBusy(false);
    }
  };

  const saveSignature = async () => {
    if (!signature || !acknowledged) return;
    setBusy(true);
    const operationId = crypto.randomUUID();
    const record: PreMoveRecord = {
      signature,
      signedAt: new Date().toISOString(),
      by: "",
      photoCount: checklist.total,
      rooms: checklist.rooms,
      photos: prePhotos.map(preMovePhotoMeta),
      statement: PRE_MOVE_STATEMENT,
    };
    try {
      try {
        const updated = await crmFetch<{ preMoveInspection?: PreMoveRecord }>(
          `/field/jobs/${jobId}/pre-move`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signature, acknowledge: true, operationId }),
          },
        );
        onSaved(updated.preMoveInspection ?? record);
        toast.success("Pre-move inspection signed and saved to the job");
      } catch (reason) {
        if (navigator.onLine && !(reason instanceof TypeError)) throw reason;
        await queue(jobId, "pre-move", { signature, acknowledge: true, operationId });
        onSaved(record);
        toast("Signature saved on this phone — it will sync when you're back online.");
      }
      setReview(false);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save the acknowledgment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 font-semibold text-card-foreground">
          <ClipboardCheck className="h-4 w-4" /> Pre-Move Damage Inspection
        </h2>
        <p className="text-sm text-muted-foreground">
          Record existing damage before anything is loaded, then have the customer sign to
          acknowledge it.
        </p>
      </header>

      {saved ? (
        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Acknowledged by the customer
          </p>
          <p className="text-sm text-muted-foreground">
            Signed {new Date(saved.signedAt).toLocaleString()} · {preMoveSummaryLine(checklist)}
          </p>
          {saved.signature && (
            <img
              src={saved.signature}
              alt="Customer acknowledgment signature"
              className="h-20 w-full rounded-lg border border-border bg-background object-contain"
            />
          )}
        </div>
      ) : closed ? (
        <p
          className={`rounded-xl p-3 text-sm ${
            locked
              ? "bg-muted text-foreground"
              : "border border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          <TriangleAlert className="mr-2 inline h-4 w-4" />
          {locked
            ? "The job is signed off, so the inspection record is locked."
            : "Loading has already started, so a pre-move inspection can no longer be signed. Ask the office to note it on the job."}
        </p>
      ) : review ? (
        <div className="space-y-3 rounded-xl border border-border bg-background p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Pre-Move Inspection Summary
              </h3>
              <p className="text-sm text-muted-foreground">{preMoveSummaryLine(checklist)}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReview(false)}
              aria-label="Close summary"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {prePhotos.length === 0 ? (
            <p className="rounded-lg bg-muted p-3 text-sm text-foreground">
              No pre-existing damage has been photographed. Signing confirms the crew found none
              before loading.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {prePhotos.map((photo) => (
                <li key={photo.id} className="overflow-hidden rounded-lg border border-border">
                  <img
                    src={photo.photoUrl}
                    alt={photo.item || "Pre-move damage photo"}
                    className="h-24 w-full object-cover"
                  />
                  <div className="space-y-0.5 p-2">
                    <p className="text-xs font-semibold text-foreground">
                      {photo.item || "Unlabelled item"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {photo.room || "Room not recorded"}
                    </p>
                    {photo.description && (
                      <p className="text-[11px] text-muted-foreground">{photo.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {checklist.unlabelled > 0 && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              {checklist.unlabelled} photo{checklist.unlabelled === 1 ? " has" : "s have"} no room
              or item recorded. The customer can still sign, but labelled photos are stronger
              evidence.
            </p>
          )}

          <p className="rounded-lg bg-muted p-3 text-sm text-foreground">{PRE_MOVE_STATEMENT}</p>

          <SignaturePad
            onChange={setSignature}
            label="Customer signs to acknowledge pre-existing conditions"
          />
          {signature && (
            <img
              src={signature}
              alt="Captured customer acknowledgment"
              className="h-20 w-full rounded-md border border-border object-contain"
            />
          )}

          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-1"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              I have reviewed these photos and notes with the crew before loading started.
            </span>
          </label>

          <Button
            className="min-h-12 w-full"
            disabled={!signature || !acknowledged || busy}
            onClick={() => void saveSignature()}
          >
            <ShieldCheck className="h-4 w-4" />
            {busy ? "Saving…" : "Save customer acknowledgment"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-sm font-medium text-foreground">
              Room
              <select
                className={inputClass}
                value={room}
                onChange={(event) => setRoom(event.target.value)}
              >
                {DAMAGE_ROOMS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-foreground">
              Item
              <input
                className={inputClass}
                value={item}
                onChange={(event) => setItem(event.target.value)}
                placeholder="e.g. Dresser"
                maxLength={120}
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm font-medium text-foreground">
            Description of existing damage
            <input
              className={inputClass}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Scratch on top-left corner"
              maxLength={500}
            />
          </label>

          <label
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-background font-medium text-foreground ${
              canCapture ? "cursor-pointer" : "cursor-not-allowed opacity-50"
            }`}
          >
            <Camera className="h-5 w-5" />
            {busy ? "Saving…" : "Take or upload damage photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={!canCapture}
              onChange={(event) => {
                void capture(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          {!item.trim() && (
            <p className="text-xs text-muted-foreground">
              Add the room and item before taking a photo.
            </p>
          )}

          {prePhotos.length > 0 && (
            <ul className="space-y-2">
              {prePhotos.map((photo) => (
                <li key={photo.id} className="flex gap-3 rounded-xl border border-border p-2">
                  <img
                    src={photo.photoUrl}
                    alt={photo.item || "Pre-move damage photo"}
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {photo.item || "Unlabelled item"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {photo.room || "Room not recorded"}
                    </p>
                    {photo.description && (
                      <p className="truncate text-xs text-muted-foreground">{photo.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Button
            className="min-h-12 w-full"
            variant="outline"
            onClick={() => setReview(true)}
            disabled={busy}
          >
            <ImagePlus className="h-4 w-4" /> Review pre-move inspection & get signature
          </Button>
          <p className="text-xs text-muted-foreground">
            {preMoveSummaryLine(checklist)} · the inspection locks when loading starts.
          </p>
        </div>
      )}
    </section>
  );
}
