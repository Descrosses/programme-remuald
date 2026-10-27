/**
 * Deux écritures qui se croisent sur une ligne unique.
 *
 * Toujours le même défaut : « lire la ligne, puis l'écrire » hors
 * transaction. Deux appels concurrents voient tous les deux « rien en base »
 * et insèrent tous les deux ; l'index unique rejette le second, et la saisie
 * est perdue sans message. Invisible en cliquant lentement, systématique en
 * tapant vite ou en validant plusieurs séries d'affilée.
 *
 * `ensureSession` était le plus grave : son échec laisse la séance SANS ligne,
 * et plus aucune série ne peut s'enregistrer.
 */

import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { ProgrammeDB } from "./db";

const NOM = "remuald-concurrence-test";

async function supprimer(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onblocked = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function baseJetable(): Promise<ProgrammeDB> {
  await supprimer(NOM);
  const jetable = new ProgrammeDB(NOM);
  await jetable.open();
  const mod = await import("./db");
  Object.defineProperty(mod, "db", {
    value: jetable,
    configurable: true,
    writable: true,
  });
  return jetable;
}

describe("ensureSession", () => {
  beforeEach(async () => {
    await supprimer(NOM);
  });

  it("crée UNE ligne et la rend aux trois appelants", async () => {
    const db = await baseJetable();
    const { ensureSession } = await import("./repo");

    const [a, b, c] = await Promise.all([
      ensureSession(5, 0, "2026-09-28"),
      ensureSession(5, 0, "2026-09-28"),
      ensureSession(5, 0, "2026-09-28"),
    ]);

    expect(await db.sessions.count()).toBe(1);
    expect(a.id).toBeDefined();
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
    db.close();
  });

  it("ne pose l’heure de début qu’une seule fois", async () => {
    const db = await baseJetable();
    const { ensureSession } = await import("./repo");
    const premier = await ensureSession(5, 0, "2026-09-28");
    await new Promise((r) => setTimeout(r, 5));
    expect((await ensureSession(5, 0, "2026-09-28")).startedAt).toBe(
      premier.startedAt,
    );
    db.close();
  });
});

describe("les autres écritures sur index unique", () => {
  beforeEach(async () => {
    await supprimer(NOM);
  });

  it("la pesée du jour reste une seule ligne", async () => {
    const db = await baseJetable();
    const { saveMeasurement } = await import("./repo");
    await Promise.all([
      saveMeasurement("2026-09-28", { weightKg: 78 }),
      saveMeasurement("2026-09-28", { weightKg: 78.5 }),
      saveMeasurement("2026-09-28", { waistCm: 83 }),
    ]);
    expect(await db.measurements.count()).toBe(1);
    db.close();
  });

  it("la remarque d’un mouvement ne perd pas de frappe", async () => {
    const db = await baseJetable();
    const { saveExerciseNote, notesForExercise } = await import("./repo");
    await Promise.all(
      ["é", "ép", "épa", "épaul", "épaule"].map((t) =>
        saveExerciseNote({
          exerciseId: "bench-press",
          week: 5,
          day: 2,
          date: "2026-09-30",
          text: t,
        }),
      ),
    );
    expect(await db.exerciseNotes.count()).toBe(1);
    expect((await notesForExercise("bench-press"))[0]!.text).toBeTruthy();
    db.close();
  });

  it("un repas coché deux fois reste coché une fois", async () => {
    const db = await baseJetable();
    const { setMealEaten } = await import("./repo");
    await Promise.all([
      setMealEaten("2026-09-28", "petit-dejeuner", true),
      setMealEaten("2026-09-28", "petit-dejeuner", true),
    ]);
    expect(await db.mealLog.count()).toBe(1);
    db.close();
  });

  it("un aliment personnalisé ne se dédouble pas", async () => {
    const db = await baseJetable();
    const { saveCustomFood } = await import("./repo");
    const base = {
      foodId: "custom.skyr",
      label: "Skyr",
      unit: "g" as const,
      per: 100,
      kcal: 63,
      proteinG: 11,
      carbsG: 4,
      fatG: 0.2,
      referenceState: "na" as const,
      category: "laitier",
      addedAt: "2026-09-28",
    };
    await Promise.all([
      saveCustomFood(base),
      saveCustomFood({ ...base, kcal: 64 }),
    ]);
    expect(await db.customFoods.count()).toBe(1);
    db.close();
  });

  it("une étiquette corrigée ne se dédouble pas", async () => {
    const db = await baseJetable();
    const { saveFoodOverride } = await import("./repo");
    await Promise.all([
      saveFoodOverride("skyr", { qty: 200 }),
      saveFoodOverride("skyr", { kcal: 64 }),
    ]);
    expect(await db.foodOverrides.count()).toBe(1);
    db.close();
  });

  it("un relevé de readiness ne crée pas de doublon", async () => {
    /*
     * Ici l'index n'est PAS unique : une course n'échoue pas, elle crée une
     * seconde ligne. Deux relevés pour la même séance, et la référence du feu
     * tricolore devient indécidable.
     */
    const db = await baseJetable();
    const { saveReadiness } = await import("./repo");
    const row = {
      date: "2026-09-28",
      week: 5,
      day: 0 as const,
      attempts: [230, 232, null],
      jumpCm: 232,
      level: "vert" as const,
      pctDelta: 0,
    };
    await Promise.all([
      saveReadiness(row),
      saveReadiness({ ...row, jumpCm: 235 }),
    ]);
    expect(await db.readiness.count()).toBe(1);
    db.close();
  });
});
