import { describe, expect, it } from "vitest";
import {
  VAULT_PHOTO_LIMIT,
  appendVaultPhoto,
  isVaultPhotoUrl,
  jobVaultGallery,
  jobVaultRecord,
  mergeJobVaultGallery,
  publicVaultGallery,
  removeVaultPhoto,
  vaultPhotos,
  type VaultPhoto,
} from "./vault-photos";

const jpeg = "data:image/jpeg;base64,ZmFrZQ==";
const photo = (id: string, patch: Partial<VaultPhoto> = {}): VaultPhoto => ({
  id,
  dataUrl: jpeg,
  caption: `Photo ${id}`,
  kind: "inspection",
  capturedAt: "2026-05-04T08:00:00.000Z",
  ...patch,
});

describe("vault photo storage", () => {
  it("accepts only compressed raster data URLs or HTTPS links", () => {
    expect(isVaultPhotoUrl(jpeg)).toBe(true);
    expect(isVaultPhotoUrl("https://cdn.example.test/vault.jpg")).toBe(true);
    expect(isVaultPhotoUrl("javascript:alert(1)")).toBe(false);
    expect(isVaultPhotoUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isVaultPhotoUrl("data:image/jpeg;base64," + "a".repeat(200_000))).toBe(false);
    expect(isVaultPhotoUrl(42)).toBe(false);
  });

  it("keeps well-formed photos newest first and caps the vault", () => {
    const rows = [
      photo("old", { capturedAt: "2026-04-01T08:00:00.000Z" }),
      photo("new", { capturedAt: "2026-05-04T08:00:00.000Z" }),
      { ...photo("bad", { capturedAt: "not-a-date" }) },
      { id: "x", dataUrl: "javascript:alert(1)", capturedAt: "2026-05-04T08:00:00.000Z" },
      ...Array.from({ length: 8 }, (_, index) =>
        photo(`extra-${index}`, { capturedAt: `2026-05-03T0${index}:00:00.000Z` }),
      ),
    ];
    const kept = vaultPhotos(rows);
    expect(kept).toHaveLength(VAULT_PHOTO_LIMIT);
    expect(kept[0]?.id).toBe("new");
    expect(kept.some((entry) => entry.id === "bad")).toBe(false);
    expect(vaultPhotos(null)).toEqual([]);
  });

  it("appends and removes without duplicating an id", () => {
    const saved = appendVaultPhoto([photo("a")], photo("b"));
    expect(saved.map((entry) => entry.id)).toEqual(["b", "a"]);
    const replaced = appendVaultPhoto(saved, photo("a", { caption: "Updated" }));
    expect(replaced.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(replaced[0]?.caption).toBe("Updated");
    expect(removeVaultPhoto(replaced, "a").map((entry) => entry.id)).toEqual(["b"]);
  });
});

/** Fail loudly instead of passing a nullable record into the merger. */
const record = (input: Parameters<typeof jobVaultRecord>[0]) => {
  const saved = jobVaultRecord(input);
  if (!saved) throw new Error("expected a job vault record");
  return saved;
};

describe("job vault gallery", () => {
  const vault = {
    id: 4,
    code: "a-101",
    items: [
      { name: "Sofa", quantity: 1 },
      { name: "Wardrobe boxes", quantity: 6 },
    ],
    photos: [photo("p1"), photo("p2", { capturedAt: "2026-05-05T08:00:00.000Z", caption: "" })],
  };

  it("snapshots assets and captioned photos without vault contact details", () => {
    const record = jobVaultRecord(vault, "2026-05-06T10:00:00.000Z");
    expect(record).toMatchObject({
      vaultId: 4,
      code: "A-101",
      syncedAt: "2026-05-06T10:00:00.000Z",
      assets: [
        { name: "Sofa", quantity: 1 },
        { name: "Wardrobe boxes", quantity: 6 },
      ],
    });
    expect(record?.photos.map((entry) => entry.id)).toEqual(["p2", "p1"]);
    expect(record?.photos[0]?.caption).toBe("Vault A-101 inspection");
    expect(JSON.stringify(record)).not.toContain("contact");
    expect(jobVaultRecord({ id: 1, code: "B-1", items: [], photos: [] })).toBeNull();
  });

  it("replaces one vault entry and keeps the gallery alphabetical", () => {
    const other = { ...vault, id: 2, code: "B-201" };
    const gallery = mergeJobVaultGallery(
      [record(other), record(vault)],
      record({ ...vault, photos: [photo("p3")] }),
    );
    expect(gallery.map((entry) => entry.code)).toEqual(["A-101", "B-201"]);
    expect(gallery.find((entry) => entry.code === "A-101")?.photos.map((p) => p.id)).toEqual([
      "p3",
    ]);
  });

  it("ignores tampered gallery entries", () => {
    const gallery = jobVaultGallery([
      {
        vaultId: 3,
        code: "A-1",
        syncedAt: "x",
        assets: [],
        photos: [{ id: "p", url: "javascript:1", capturedAt: "2026-05-04T08:00:00.000Z" }],
      },
      { vaultId: "nope", code: "B-1", photos: [] },
      null,
    ]);
    expect(gallery).toEqual([{ vaultId: 3, code: "A-1", syncedAt: "x", assets: [], photos: [] }]);
  });

  it("publishes a bounded customer-safe gallery", () => {
    const gallery = [
      jobVaultRecord(vault),
      jobVaultRecord({ ...vault, id: 8, code: "C-1" }),
      jobVaultRecord({ ...vault, id: 9, code: "D-1" }),
    ];
    const publicRows = publicVaultGallery(gallery);
    expect(publicRows).toHaveLength(2);
    expect(Object.keys(publicRows[0] ?? {})).toEqual(["code", "assets", "photos"]);
    expect(publicRows[0]?.photos).toHaveLength(2);
    expect(JSON.stringify(publicRows)).not.toContain("vaultId");
  });
});
