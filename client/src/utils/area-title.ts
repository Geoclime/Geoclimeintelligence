/** "Rivers" at level "State" reads as "Rivers State"; a name that already ends in its level is left alone. */
export function areaTitle(unitName: string, levelName: string): string {
  return unitName.toLowerCase().endsWith(levelName.toLowerCase()) ? unitName : `${unitName} ${levelName}`;
}

/** "Rivers State", "Rivers State and Lagos State", "Rivers State, Lagos State and Bayelsa State". */
export function listAreas(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
