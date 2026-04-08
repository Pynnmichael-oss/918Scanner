export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "#6b7280";
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#eab308";
  return "#ef4444";
}
