import { describe, expect, it } from "vitest";
import { clearDraft, loadDraft, saveDraft } from "./survey-draft";

/** A tiny stand-in for localStorage. */
function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const NOW = 1_800_000_000_000;
const draft = { target: "flood" as const, points: [[7, 4.8], [7.001, 4.8], [7.001, 4.801]] as [number, number][], gpsPoints: 3, accuracies: [6, 8, 7] };

describe("survey draft", () => {
  it("keeps an unfinished walk and gives it back whole", () => {
    const store = memoryStore();
    saveDraft(draft, store, NOW);
    expect(loadDraft(store, NOW + 60_000)).toEqual({ ...draft, savedAt: NOW });
  });

  it("forgets the draft when it is cleared, or when there is nothing in it", () => {
    const store = memoryStore();
    saveDraft(draft, store, NOW);
    clearDraft(store);
    expect(loadDraft(store, NOW)).toBeNull();

    saveDraft(draft, store, NOW);
    saveDraft({ ...draft, points: [] }, store, NOW);
    expect(store.data.size).toBe(0);
  });

  it("drops a draft from another day: the flood has moved on", () => {
    const store = memoryStore();
    saveDraft(draft, store, NOW);
    expect(loadDraft(store, NOW + 25 * 3_600_000)).toBeNull();
  });

  it("reads a broken or foreign draft as none, never as an error", () => {
    expect(loadDraft(memoryStore({ "geoclime.survey-draft.v1": "{not json" }), NOW)).toBeNull();
    expect(loadDraft(memoryStore({ "geoclime.survey-draft.v1": JSON.stringify({ ...draft, target: "swim", savedAt: NOW }) }), NOW)).toBeNull();
    expect(loadDraft(memoryStore({ "geoclime.survey-draft.v1": JSON.stringify({ ...draft, points: [[999, 4]], savedAt: NOW }) }), NOW)).toBeNull();
    expect(loadDraft(undefined, NOW)).toBeNull();
  });

  it("carries on when storage refuses, as in a private window", () => {
    const refusing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    expect(() => saveDraft(draft, refusing, NOW)).not.toThrow();
    expect(loadDraft(refusing, NOW)).toBeNull();
  });
});
