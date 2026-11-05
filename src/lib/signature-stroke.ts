export function hasSignatureStroke(distance: number): boolean {
  return Number.isFinite(distance) && distance >= 8;
}