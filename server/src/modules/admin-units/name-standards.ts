/**
 * Standard area names, and the spellings different sources use for them.
 *
 * Sources disagree on punctuation and spelling: geoBoundaries writes "Obio/Akpor", "Emuoha" and
 * "Omumma"; the GRID3/INEC wards file writes "Port-Harcourt" and "Akuku Toru"; this project's
 * Data Discovery report standardises on "Obio-Akpor", "Emohua" and "Omuma"
 * (README_rivers_state_boundaries.md). The import checks map every variant to the standard
 * name, and say so in a warning, so the live table holds one spelling per area.
 *
 * This is a validation list, not data: nothing here is ever inserted into a table.
 */

/** Case-, accent- and punctuation-blind key: "Obio/Akpor", "obio-akpor" and "OBIO AKPOR" all match. */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface NameStandard {
  /** Shown in error messages, e.g. "the 23 standard Rivers State LGA names". */
  label: string;
  countryCode: string;
  level: number;
  /** nameKey()s of the parent area this list applies under. */
  parentKeys: string[];
  names: readonly string[];
  /** Spelling variants (as nameKey) -> standard name. Punctuation-only variants need no entry. */
  aliases: Readonly<Record<string, string>>;
}

const RIVERS_STATE_LGAS: NameStandard = {
  label: "the 23 standard Rivers State LGA names",
  countryCode: "NGA",
  level: 2,
  parentKeys: ["rivers", "rivers state"],
  names: [
    "Abua-Odual", "Ahoada East", "Ahoada West", "Akuku-Toru", "Andoni", "Asari-Toru", "Bonny", "Degema",
    "Eleme", "Emohua", "Etche", "Gokana", "Ikwerre", "Khana", "Obio-Akpor", "Ogba-Egbema-Ndoni", "Ogu-Bolo",
    "Okrika", "Omuma", "Opobo-Nkoro", "Oyigbo", "Port Harcourt", "Tai",
  ],
  aliases: {
    emuoha: "Emohua",
    omumma: "Omuma",
    "obia akpor": "Obio-Akpor",
  },
};

const STANDARDS: readonly NameStandard[] = [RIVERS_STATE_LGAS];

/** The standard list for areas at `level` under the parent named `parentName`, if one exists. */
export function findNameStandard(countryCode: string, level: number, parentName: string | null): NameStandard | undefined {
  if (!parentName) return undefined;
  const parentKey = nameKey(parentName);
  return STANDARDS.find(
    (s) => s.countryCode === countryCode && s.level === level && s.parentKeys.includes(parentKey),
  );
}

/** The standard spelling of `name` under `standard`, or null if it isn't on the list at all. */
export function standardName(name: string, standard: NameStandard): string | null {
  const key = nameKey(name);
  const aliased = standard.aliases[key];
  if (aliased) return aliased;
  return standard.names.find((candidate) => nameKey(candidate) === key) ?? null;
}

/**
 * The key two names are compared by when matching a parent or spotting a duplicate: nameKey,
 * with known spelling variants folded together and a trailing "state" dropped, so "Rivers
 * State" finds "Rivers" and "Emuoha" finds "Emohua".
 */
export function matchKey(name: string, countryCode: string): string {
  let key = nameKey(name);
  for (const standard of STANDARDS) {
    if (standard.countryCode !== countryCode) continue;
    const aliased = standard.aliases[key];
    if (aliased) key = nameKey(aliased);
  }
  const withoutState = key.replace(/ state$/, "");
  return withoutState.length > 0 ? withoutState : key;
}
