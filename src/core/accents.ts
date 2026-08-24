export const ACCENT_HEXES = [
  '#7c6df2', '#4bbca2', '#e39a4d', '#db6d8e',
  '#52a8df', '#a678dc', '#8fbd55', '#e06b61'
] as const;

export const ACCENT_COUNT = ACCENT_HEXES.length;

export function isAccent(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < ACCENT_COUNT;
}
