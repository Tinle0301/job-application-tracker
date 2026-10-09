/** Tailwind classes for a 0–100 resume match score. */
export function fitTone(score: number): string {
  if (score >= 80) return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
  if (score >= 60) return 'bg-amber-50 text-amber-800 ring-amber-200'
  return 'bg-rose-50 text-rose-700 ring-rose-200'
}
