export function getFreeTransfersAvailable(currentEvent: number, isPreSeason: boolean, carriedTransfers = 1): number {
  if (isPreSeason) return Number.POSITIVE_INFINITY;
  if (currentEvent <= 2) return 1;
  return Math.min(5, Math.max(1, carriedTransfers + 1));
}