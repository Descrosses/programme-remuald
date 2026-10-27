/**
 * L'export est la SEULE copie de secours de cette base.
 *
 * Une table absente du fichier disparaît au premier changement de téléphone,
 * sans message et sans qu'on s'en aperçoive. Quatre l'étaient : les remarques
 * laissées sur chaque mouvement, les repas cochés, les aliments saisis à la
 * main et les étiquettes corrigées.
 *
 * Ce test remplit, exporte, vide, réimporte et compare — et vérifie qu'un
 * fichier exporté AVANT ce correctif reste réimportable tel quel.
 */

import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { ProgrammeDB } from "./db";

const NOM = "remuald-sauvegarde-test";

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

describe("sauvegarde complète", () => {
  beforeEach(async () => {
    await supprimer(NOM);
  });

  it("emporte les quatre tables qui manquaient", async () => {
    const base = await baseJetable();
    const { exportAll, importAll } = await import("./export");

    await base.exerciseNotes.add({
      exerciseId: "bench-press",
      week: 1,
      day: 2,
      date: "2026-08-31",
      text: "épaule gauche tire un peu",
      updatedAt: 1_756_600_000_000,
    });
    await base.mealLog.add({
      date: "2026-09-14",
      mealId: "petit-dejeuner",
      at: "2026-09-14T08:00:00.000Z",
    });
    await base.customFoods.add({
      foodId: "custom.skyr",
      label: "Skyr",
      unit: "g",
      per: 100,
      kcal: 63,
      proteinG: 11,
      carbsG: 4,
      fatG: 0.2,
      referenceState: "na",
      category: "laitier",
      addedAt: "2026-09-14",
    });
    await base.foodOverrides.add({ foodId: "pain", qty: 80 });

    const fichier = await exportAll();
    expect(fichier.exerciseNotes).toHaveLength(1);
    expect(fichier.mealLog).toHaveLength(1);
    expect(fichier.customFoods).toHaveLength(1);
    expect(fichier.foodOverrides).toHaveLength(1);

    // Le fichier doit survivre à un aller-retour par JSON : c'est ce que
    // Remuald manipule, pas l'objet en mémoire.
    const relu = JSON.parse(JSON.stringify(fichier)) as typeof fichier;
    const rapport = await importAll(relu);

    expect(rapport.exerciseNotes).toBe(1);
    expect(rapport.mealLog).toBe(1);
    expect(rapport.customFoods).toBe(1);
    expect(rapport.foodOverrides).toBe(1);

    expect((await base.exerciseNotes.toArray())[0]!.text).toBe(
      "épaule gauche tire un peu",
    );
    expect((await base.customFoods.toArray())[0]!.label).toBe("Skyr");
    expect((await base.foodOverrides.toArray())[0]!.qty).toBe(80);

    base.close();
  });

  it("réimporte un fichier d’avant ce correctif, qui ne les connaît pas", async () => {
    const base = await baseJetable();
    const { importAll, parseExport } = await import("./export");

    const ancien = JSON.stringify({
      format: "programme-remuald",
      version: 1,
      exportedAt: "2026-09-14T08:00:00.000Z",
      settings: null,
      sessions: [
        {
          week: 2,
          day: 5,
          date: "2026-09-12",
          status: "done",
          warmupChecked: [],
          notes: "Dos bien plat.",
        },
      ],
      sets: [],
      readiness: [],
      combines: [],
      photosIncluded: false,
    });

    const fichier = parseExport(ancien);
    const rapport = await importAll(fichier);
    expect(rapport.sessions).toBe(1);
    expect(rapport.exerciseNotes).toBe(0);
    expect(await base.sessions.count()).toBe(1);

    base.close();
  });
});
