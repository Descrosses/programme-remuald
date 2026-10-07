/**
 * Accès à la base. Aucune logique de programme ici : seulement lire, écrire,
 * et transformer les lignes en structures que l'engine sait consommer.
 */

import type { DayIndex, RPETarget } from '../data/types';
import type { HistoryIndex, Occurrence, ReadinessRecord, Settings } from '../engine/types';
import type { FoodOverride, FoodOverrides } from '../engine/nutrition';
import { normalizeNote } from '../engine/exerciseNotes';
import type { WeekIndex } from '../data/types';
import { dateFor } from '../engine/calendar';
import { lowerIsBetter } from '../engine/lastPerformance';
import {
  DEFAULT_SETTINGS_ROW,
  db,
  type CombinePhase,
  type CombineRow,
  type CustomFoodRow,
  type ExerciseMediaRow,
  type MealLogRow,
  type ExerciseNoteRow,
  type ExerciseReferenceRow,
  type ExerciseVideoLogRow,
  type FoodOverrideRow,
  type MeasurementRow,
  type ProgressPhotoRow,
  type ReadinessRow,
  type SessionRow,
  type SetRow,
  type SettingsRow,
} from './db';

// --------------------------------------------------------------- réglages --

export async function getSettingsRow(): Promise<SettingsRow> {
  // Fusion avec les valeurs par défaut : une base créée par une version
  // antérieure ne connaît pas les champs ajoutés depuis (poids de corps…).
  return { ...DEFAULT_SETTINGS_ROW, ...(await db.settings.get(1)) };
}

export async function saveSettings(patch: Partial<SettingsRow>): Promise<SettingsRow> {
  const current = await getSettingsRow();
  const next = { ...current, ...patch, id: 1 as const };
  await db.settings.put(next);
  if (next.startDate !== current.startDate && next.startDate !== '') {
    await realignScheduleDates(next.startDate);
  }
  return next;
}

/**
 * Recale sur la nouvelle ancre les dates qui DÉCOULENT du calendrier.
 *
 * Décaler la date de début ne change aucune performance : une série est rangée
 * sous `[semaine, jour]`, jamais sous sa date. Mais les lignes déjà écrites
 * portent une copie de leur date, calculée avec l'ancienne ancre. Sans ce
 * passage, l'écran Semaine afficherait la bonne date (il la recalcule) pendant
 * que l'historique en garderait une périmée — deux vérités pour la même séance.
 *
 * Ce qui est recalé : les séances, leurs séries, et les tests de détente, parce
 * que leur date n'est qu'une conséquence de la case du calendrier.
 *
 * Ce qui ne l'est JAMAIS : les pesées, les photos, les vidéos notées et les
 * résultats du combine. Ces dates-là sont des faits — le jour où Guillaume
 * s'est pesé, le jour où il a pris la photo. Les décaler falsifierait
 * l'historique au lieu de le corriger.
 */
export async function realignScheduleDates(startDate: string): Promise<number> {
  let recalees = 0;

  for (const row of await db.sessions.toArray()) {
    const attendue = dateFor(startDate, row.week as WeekIndex, row.day);
    if (row.date === attendue || row.id === undefined) continue;
    await db.sessions.update(row.id, { date: attendue });
    await db.sets.where('sessionId').equals(row.id).modify({ date: attendue });
    recalees += 1;
  }

  for (const row of await db.readiness.toArray()) {
    const attendue = dateFor(startDate, row.week as WeekIndex, row.day);
    if (row.date === attendue || row.id === undefined) continue;
    await db.readiness.update(row.id, { date: attendue });
    recalees += 1;
  }

  return recalees;
}

export function toEngineSettings(row: SettingsRow): Settings {
  return {
    startDate: row.startDate,
    broadJumpBaselineCm: row.broadJumpBaselineCm,
    oneRM: row.oneRM as Settings['oneRM'],
  };
}

// ---------------------------------------------------------------- séances --

/**
 * Crée la ligne de séance si elle n'existe pas encore.
 *
 * `date` est toujours recalculée depuis l'ancre des Réglages. Si Guillaume
 * corrige sa date de début, les lignes déjà créées portaient l'ancienne date :
 * on les réaligne ici, sinon l'écran Semaine et l'historique resteraient sur un
 * calendrier périmé jusqu'à une remise à zéro.
 */
export async function ensureSession(week: number, day: DayIndex, date: string): Promise<SessionRow> {
  const existing = await db.sessions.where('[week+day]').equals([week, day]).first();
  if (existing) {
    if (existing.date !== date && existing.id !== undefined) {
      await db.sessions.update(existing.id, { date });
      await db.sets.where('sessionId').equals(existing.id).modify({ date });
      return { ...existing, date };
    }
    return existing;
  }
  const row: SessionRow = {
    week,
    day,
    date,
    status: 'planned',
    warmupChecked: [],
    notes: '',
    startedAt: Date.now(),
  };
  const id = await db.sessions.add(row);
  return { ...row, id };
}

export async function getSession(week: number, day: DayIndex): Promise<SessionRow | undefined> {
  return db.sessions.where('[week+day]').equals([week, day]).first();
}

export async function allSessions(): Promise<SessionRow[]> {
  return db.sessions.toArray();
}

export async function updateSession(id: number, patch: Partial<SessionRow>): Promise<void> {
  await db.sessions.update(id, patch);
}

export async function toggleWarmupItem(sessionId: number, itemId: string): Promise<string[]> {
  const row = await db.sessions.get(sessionId);
  if (!row) return [];
  const checked = row.warmupChecked.includes(itemId)
    ? row.warmupChecked.filter((i) => i !== itemId)
    : [...row.warmupChecked, itemId];
  await db.sessions.update(sessionId, { warmupChecked: checked });
  return checked;
}

// ----------------------------------------------------------------- séries --

export interface SetInput {
  sessionId: number;
  exerciseId: string;
  week: number;
  day: DayIndex;
  date: string;
  setIndex: number;
  plannedKg: number | null;
  plannedReps: number | null;
  targetRPE: RPETarget | null;
  actualKg: number | null;
  actualReps: number | null;
  actualRpe: number | null;
  measureValue?: number | null;
  failed: boolean;
}

/**
 * Écrit une série. Appelée au moment exact où Guillaume valide : rien n'est
 * gardé en mémoire en attendant la fin de la séance.
 */
export async function saveSet(input: SetInput): Promise<number> {
  const row: SetRow = {
    sessionId: input.sessionId,
    exerciseId: input.exerciseId,
    week: input.week,
    day: input.day,
    date: input.date,
    setIndex: input.setIndex,
    plannedKg: input.plannedKg,
    plannedReps: input.plannedReps,
    targetRpeMin: input.targetRPE?.min ?? null,
    targetRpeMax: input.targetRPE?.max ?? null,
    targetRpeLabel: input.targetRPE?.label ?? null,
    actualKg: input.actualKg,
    actualReps: input.actualReps,
    actualRpe: input.actualRpe,
    measureValue: input.measureValue ?? null,
    failed: input.failed,
    doneAt: Date.now(),
  };

  const existing = await db.sets
    .where('[sessionId+exerciseId]')
    .equals([input.sessionId, input.exerciseId])
    .and((s) => s.setIndex === input.setIndex)
    .first();

  if (existing?.id !== undefined) {
    await db.sets.update(existing.id, row);
    return existing.id;
  }
  return db.sets.add(row);
}

export async function deleteSet(id: number): Promise<void> {
  await db.sets.delete(id);
}

export async function setsForSession(sessionId: number): Promise<SetRow[]> {
  return db.sets.where('sessionId').equals(sessionId).sortBy('setIndex');
}

export async function allSets(): Promise<SetRow[]> {
  return db.sets.toArray();
}

// -------------------------------------------------------------- readiness --

export async function saveReadiness(row: ReadinessRow): Promise<void> {
  const existing = await db.readiness.where('[week+day]').equals([row.week, row.day]).first();
  // `put` plutôt que `update` : on remplace la ligne entière, y compris le
  // tableau des 3 essais.
  await db.readiness.put(existing?.id === undefined ? row : { ...row, id: existing.id });
}

export async function getReadiness(week: number, day: DayIndex): Promise<ReadinessRow | undefined> {
  return db.readiness.where('[week+day]').equals([week, day]).first();
}

export async function allReadiness(): Promise<ReadinessRow[]> {
  return db.readiness.orderBy('date').toArray();
}

export function toReadinessRecords(rows: ReadinessRow[]): ReadinessRecord[] {
  return rows.map((r) => ({ date: r.date, week: r.week, day: r.day, jumpCm: r.jumpCm }));
}

// --------------------------------------------------------------- combines --

export async function saveCombine(
  phase: CombinePhase,
  patch: Partial<Omit<CombineRow, 'id' | 'phase'>>,
): Promise<CombineRow> {
  const existing = await db.combines.where('phase').equals(phase).first();
  const next: CombineRow = {
    phase,
    date: patch.date ?? existing?.date ?? new Date().toISOString().slice(0, 10),
    metrics: { ...(existing?.metrics ?? {}), ...(patch.metrics ?? {}) },
    notes: patch.notes ?? existing?.notes ?? '',
  };
  if (existing?.id !== undefined) {
    await db.combines.put({ ...next, id: existing.id });
    return { ...next, id: existing.id };
  }
  const id = await db.combines.add(next);
  return { ...next, id };
}

export async function allCombines(): Promise<CombineRow[]> {
  return db.combines.toArray();
}

// ----------------------------------------------------------- mesures corps --

/**
 * Écrit la pesée (et/ou le tour de taille) d'un jour.
 *
 * Une seule ligne par date : se repeser deux fois le même matin corrige la
 * valeur, ça n'ajoute pas un second point qui pèserait double dans la moyenne.
 * Les champs laissés à `undefined` ne sont pas écrasés — on peut saisir le
 * tour de taille sans retaper le poids.
 */
export async function saveMeasurement(
  date: string,
  patch: { weightKg?: number | null; waistCm?: number | null },
): Promise<MeasurementRow> {
  const existing = await db.measurements.where('date').equals(date).first();
  const next: MeasurementRow = {
    date,
    weightKg: patch.weightKg !== undefined ? patch.weightKg : (existing?.weightKg ?? null),
    waistCm: patch.waistCm !== undefined ? patch.waistCm : (existing?.waistCm ?? null),
  };

  // Une ligne entièrement vide n'a rien à faire en base : elle diluerait les
  // moyennes en se faisant passer pour un jour relevé.
  if (next.weightKg === null && next.waistCm === null) {
    if (existing?.id !== undefined) await db.measurements.delete(existing.id);
    return next;
  }

  if (existing?.id !== undefined) {
    await db.measurements.put({ ...next, id: existing.id });
    return { ...next, id: existing.id };
  }
  const id = await db.measurements.add(next);
  return { ...next, id };
}

export async function getMeasurement(date: string): Promise<MeasurementRow | undefined> {
  return db.measurements.where('date').equals(date).first();
}

export async function allMeasurements(): Promise<MeasurementRow[]> {
  return db.measurements.orderBy('date').toArray();
}

// ----------------------------------------------------------- suivi visuel --

/** Enregistre la photo de la semaine. Une seule par semaine : la reprise remplace. */
export async function savePhoto(
  row: Omit<ProgressPhotoRow, 'id'>,
): Promise<ProgressPhotoRow> {
  const existing = await db.progressPhotos.where('week').equals(row.week).first();
  if (existing?.id !== undefined) {
    await db.progressPhotos.put({ ...row, id: existing.id });
    return { ...row, id: existing.id };
  }
  const id = await db.progressPhotos.add(row);
  return { ...row, id };
}

export async function allPhotos(): Promise<ProgressPhotoRow[]> {
  return db.progressPhotos.orderBy('week').toArray();
}

export async function deletePhoto(id: number): Promise<void> {
  await db.progressPhotos.delete(id);
}

/**
 * Photo d'exécution d'un mouvement. Plusieurs dates par exercice — c'est le
 * but : comparer le squat de la semaine 1 à celui de la semaine 9.
 */
export async function saveExerciseMedia(
  row: Omit<ExerciseMediaRow, 'id'>,
): Promise<ExerciseMediaRow> {
  const existing = await db.exerciseMedia
    .where('[exerciseId+date]')
    .equals([row.exerciseId, row.date])
    .first();
  if (existing?.id !== undefined) {
    await db.exerciseMedia.put({ ...row, id: existing.id });
    return { ...row, id: existing.id };
  }
  const id = await db.exerciseMedia.add(row);
  return { ...row, id };
}

export async function mediaForExercise(exerciseId: string): Promise<ExerciseMediaRow[]> {
  return db.exerciseMedia.where('exerciseId').equals(exerciseId).sortBy('date');
}

export async function allExerciseMedia(): Promise<ExerciseMediaRow[]> {
  return db.exerciseMedia.orderBy('date').toArray();
}

export async function deleteExerciseMedia(id: number): Promise<void> {
  await db.exerciseMedia.delete(id);
}

/**
 * Fiche technique d'un mouvement. Une seule par exercice : en poser une
 * nouvelle remplace l'ancienne, sans laisser de doublon en base.
 */
export async function saveExerciseReference(
  row: Omit<ExerciseReferenceRow, 'id'>,
): Promise<ExerciseReferenceRow> {
  const existing = await db.exerciseReference.where('exerciseId').equals(row.exerciseId).first();
  if (existing?.id !== undefined) {
    await db.exerciseReference.put({ ...row, id: existing.id });
    return { ...row, id: existing.id };
  }
  const id = await db.exerciseReference.add(row);
  return { ...row, id };
}

export async function referenceForExercise(
  exerciseId: string,
): Promise<ExerciseReferenceRow | undefined> {
  return db.exerciseReference.where('exerciseId').equals(exerciseId).first();
}

export async function allExerciseReferences(): Promise<ExerciseReferenceRow[]> {
  return db.exerciseReference.orderBy('exerciseId').toArray();
}

export async function deleteExerciseReference(id: number): Promise<void> {
  await db.exerciseReference.delete(id);
}

/** Trace de vidéo : la date, pas le fichier. */
export async function logVideo(row: Omit<ExerciseVideoLogRow, 'id'>): Promise<void> {
  const existing = await db.exerciseVideoLog
    .where('[exerciseId+date]')
    .equals([row.exerciseId, row.date])
    .first();
  if (existing?.id !== undefined) await db.exerciseVideoLog.put({ ...row, id: existing.id });
  else await db.exerciseVideoLog.add(row);
}

export async function videoLogForExercise(exerciseId: string): Promise<ExerciseVideoLogRow[]> {
  return db.exerciseVideoLog.where('exerciseId').equals(exerciseId).sortBy('date');
}

export async function allVideoLog(): Promise<ExerciseVideoLogRow[]> {
  return db.exerciseVideoLog.orderBy('date').toArray();
}

export async function deleteVideoLog(id: number): Promise<void> {
  await db.exerciseVideoLog.delete(id);
}

// ---------------------------------------------------------------------------
// Remarques par exercice
// ---------------------------------------------------------------------------

/**
 * Écrit la remarque du jour sur un exercice, à chaque frappe.
 *
 * Pas de bouton « enregistrer » : c'est la règle de toute l'appli, une saisie
 * n'est jamais en attente. La clé unique `[exerciseId+week+day]` fait que la
 * ligne est corrigée, pas empilée.
 *
 * Un champ vidé SUPPRIME la ligne plutôt que d'écrire une chaîne vide, sans
 * quoi le badge de relecture s'allumerait sur des remarques sans contenu.
 */
export async function saveExerciseNote(input: {
  exerciseId: string;
  week: number;
  day: DayIndex;
  date: string;
  text: string;
}): Promise<void> {
  const existing = await db.exerciseNotes
    .where('[exerciseId+week+day]')
    .equals([input.exerciseId, input.week, input.day])
    .first();

  const texte = normalizeNote(input.text);
  if (texte === null) {
    if (existing?.id !== undefined) await db.exerciseNotes.delete(existing.id);
    return;
  }

  const row: ExerciseNoteRow = {
    exerciseId: input.exerciseId,
    week: input.week,
    day: input.day,
    date: input.date,
    text: texte,
    updatedAt: Date.now(),
    ...(existing?.id !== undefined ? { id: existing.id } : {}),
  };
  await db.exerciseNotes.put(row);
}

/** Toutes les remarques laissées sur un mouvement, sur les 12 semaines. */
export async function notesForExercise(exerciseId: string): Promise<ExerciseNoteRow[]> {
  return db.exerciseNotes.where('exerciseId').equals(exerciseId).toArray();
}

export async function allExerciseNotes(): Promise<ExerciseNoteRow[]> {
  return db.exerciseNotes.toArray();
}

export interface PhotoUsage {
  count: number;
  bytes: number;
  /** Place réellement disponible d'après le navigateur, si elle est connue. */
  quotaBytes: number | null;
  usedBytes: number | null;
}

/**
 * Encombrement des photos, pour le dire avant qu'il devienne un problème.
 *
 * On somme les tailles déjà mémorisées à l'écriture plutôt que de relire les
 * blobs : compter 200 photos ne doit pas coûter 50 Mo de lecture.
 */
export async function photoUsage(): Promise<PhotoUsage> {
  const [photos, media, references] = await Promise.all([
    allPhotos(),
    allExerciseMedia(),
    allExerciseReferences(),
  ]);
  const rows = [...photos, ...media, ...references];
  let quotaBytes: number | null = null;
  let usedBytes: number | null = null;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      quotaBytes = est.quota ?? null;
      usedBytes = est.usage ?? null;
    } catch {
      // Estimation indisponible : on affichera seulement notre propre total.
    }
  }
  return {
    count: rows.length,
    bytes: rows.reduce((n, r) => n + r.bytes, 0),
    quotaBytes,
    usedBytes,
  };
}

// -------------------------------------------------- historique pour l'engine --

/**
 * Transforme les séries enregistrées en index d'occurrences, la matière
 * première de `applyProgression`.
 *
 * Pour une semaine donnée : on retient la charge la plus lourde travaillée, le
 * RPE le plus élevé ressenti (la dernière série est la plus représentative de
 * la difficulté réelle) et le moindre échec.
 */
export function buildHistoryIndex(sets: SetRow[]): HistoryIndex {
  /*
   * Groupé par SÉANCE — semaine ET jour — et non par semaine seule.
   *
   * Un seul mouvement du programme revient deux fois dans la même semaine : le
   * Broad Jump, vendredi puis samedi. Groupées par semaine, ces deux séances
   * n'en faisaient qu'une, et le saut du vendredi devenait invisible depuis le
   * samedi. Pour les quarante autres exercices, qui n'apparaissent qu'un jour
   * par semaine, le regroupement est identique au précédent — un test le
   * vérifie plutôt que de le supposer.
   */
  const parSeance = new Map<string, Map<string, SetRow[]>>();

  for (const s of sets) {
    if (s.actualReps === null && s.actualKg === null && s.actualRpe === null && s.measureValue == null)
      continue;
    let seances = parSeance.get(s.exerciseId);
    if (!seances) parSeance.set(s.exerciseId, (seances = new Map()));
    const cle = `${s.week}/${s.day}`;
    const list = seances.get(cle);
    if (list) list.push(s);
    else seances.set(cle, [s]);
  }

  const index: HistoryIndex = {};
  for (const [exerciseId, seances] of parSeance) {
    const occurrences: Occurrence[] = [];
    const triees = [...seances.values()].sort((a, b) =>
      a[0]!.week !== b[0]!.week ? a[0]!.week - b[0]!.week : a[0]!.day - b[0]!.day,
    );
    for (const rows of triees) {
      const week = rows[0]!.week;
      const kgs = rows.map((r) => r.actualKg).filter((k): k is number => k !== null);
      const rpes = rows.map((r) => r.actualRpe).filter((r): r is number => r !== null);
      /*
       * Les mesures viennent des MÊMES lignes que les kilos : un seul passage,
       * une seule source. Le meilleur essai de la semaine, comme pour la
       * charge — un saut se juge à sa meilleure distance, pas à sa moyenne.
       * Un sprint aussi se juge à son meilleur essai, donc au plus COURT : le
       * sens est décidé par `LOWER_IS_BETTER`, pas ici.
       */
      const mesures = rows
        .map((r) => r.measureValue)
        .filter((m): m is number => m !== null && m !== undefined);
      const first = rows[0]!;
      const target: RPETarget | null =
        first.targetRpeMin !== null && first.targetRpeMax !== null
          ? { min: first.targetRpeMin, max: first.targetRpeMax, label: first.targetRpeLabel ?? '' }
          : null;

      occurrences.push({
        exerciseId,
        week,
        day: first.day,
        kg: kgs.length ? Math.max(...kgs) : null,
        plannedKg: first.plannedKg,
        rpe: rpes.length ? Math.max(...rpes) : null,
        failed: rows.some((r) => r.failed),
        targetRPE: target,
        completed: rows.some((r) => r.actualReps !== null),
        measure: mesures.length
          ? lowerIsBetter(exerciseId)
            ? Math.min(...mesures)
            : Math.max(...mesures)
          : null,
      });
    }
    index[exerciseId] = occurrences;
  }

  return index;
}

export async function loadHistoryIndex(): Promise<HistoryIndex> {
  return buildHistoryIndex(await allSets());
}

// ----------------------------------------------- valeurs d’aliment --

/**
 * Les valeurs d'aliment corrigées, prêtes pour l'engine.
 *
 * Une ligne absente n'est pas une valeur à zéro : c'est un aliment auquel
 * Guillaume n'a pas touché, donc celui du .md. `undefined` est donc conservé
 * champ par champ, jamais remplacé par 0.
 */
export async function allFoodOverrides(): Promise<FoodOverrides> {
  const out: FoodOverrides = {};
  for (const r of await db.foodOverrides.toArray()) {
    out[r.foodId] = {
      qty: r.qty,
      kcal: r.kcal,
      proteinG: r.proteinG,
      carbsG: r.carbsG,
      fatG: r.fatG,
      productId: r.productId,
    };
  }
  return out;
}

/** Écrit les valeurs corrigées d'un aliment, ou efface la ligne si elle redevient vide. */
export async function saveFoodOverride(foodId: string, patch: FoodOverride): Promise<void> {
  const vide = Object.values(patch).every((v) => v === undefined);
  const existing = await db.foodOverrides.where('foodId').equals(foodId).first();
  if (vide) {
    if (existing?.id !== undefined) await db.foodOverrides.delete(existing.id);
    return;
  }
  /*
   * On REPREND ce qui était dans la ligne, champ par champ.
   *
   * Sans ça, enregistrer une quantité effacerait le remplacement enregistré
   * juste avant : les deux vivent sous la même clé de ligne, et l'écran ne les
   * saisit pas en même temps. Un champ absent du patch veut dire « n'y touche
   * pas », pas « efface-le ».
   */
  const row: FoodOverrideRow = { ...existing, foodId, ...sansIndefinis(patch) };
  if (existing?.id !== undefined) await db.foodOverrides.update(existing.id, row);
  else await db.foodOverrides.add(row);
}

/** Les seules clés réellement renseignées — `undefined` ne doit rien écraser. */
function sansIndefinis(patch: FoodOverride): Partial<FoodOverride> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
}

// -------------------------------------------------- aliments personnalisés --

/**
 * Enregistre un aliment saisi à la main, réutilisable ensuite partout.
 *
 * `foodId` est unique : ressaisir le même aliment corrige le premier au lieu
 * d'empiler des doublons dans la liste de choix.
 */
export async function saveCustomFood(row: Omit<CustomFoodRow, 'id'>): Promise<void> {
  const existing = await db.customFoods.where('foodId').equals(row.foodId).first();
  if (existing?.id !== undefined) await db.customFoods.update(existing.id, row);
  else await db.customFoods.add(row);
}

export async function allCustomFoods(): Promise<CustomFoodRow[]> {
  return db.customFoods.orderBy('addedAt').reverse().toArray();
}

export async function deleteCustomFood(foodId: string): Promise<void> {
  const existing = await db.customFoods.where('foodId').equals(foodId).first();
  if (existing?.id !== undefined) await db.customFoods.delete(existing.id);
}

/** Revient au .md pour un aliment, ou pour tous quand `foodId` est omis. */
export async function resetFoodOverrides(foodId?: string): Promise<void> {
  if (foodId === undefined) {
    await db.foodOverrides.clear();
    return;
  }
  const existing = await db.foodOverrides.where('foodId').equals(foodId).first();
  if (existing?.id !== undefined) await db.foodOverrides.delete(existing.id);
}

// ------------------------------------------------------- repas réellement pris --

/**
 * Les repas cochés ce jour-là, par identifiant.
 *
 * Un `Set` et non une liste : l'écran ne demande jamais « lesquels » mais
 * « celui-ci, l'ai-je pris ? », et c'est la seule question qu'il pose par repas.
 */
export async function mealsEatenOn(date: string): Promise<Set<string>> {
  const rows = await db.mealLog.where('date').equals(date).toArray();
  return new Set(rows.map((r) => r.mealId));
}

/**
 * Coche ou décoche un repas.
 *
 * Décocher SUPPRIME la ligne plutôt que d'y écrire un « false » : l'absence
 * veut déjà dire « pas pris », et deux façons d'exprimer la même chose finissent
 * toujours par se contredire.
 */
export async function setMealEaten(date: string, mealId: string, eaten: boolean): Promise<void> {
  const existing = await db.mealLog.where('[date+mealId]').equals([date, mealId]).first();
  if (!eaten) {
    if (existing?.id !== undefined) await db.mealLog.delete(existing.id);
    return;
  }
  if (existing) return;
  const row: Omit<MealLogRow, 'id'> = { date, mealId, at: new Date().toISOString() };
  await db.mealLog.add(row as MealLogRow);
}

/** Efface les coches d'une journée — le bouton « j'ai mal coché, je recommence ». */
export async function clearMealsEatenOn(date: string): Promise<void> {
  const rows = await db.mealLog.where('date').equals(date).toArray();
  await db.mealLog.bulkDelete(rows.map((r) => r.id!).filter((id) => id !== undefined));
}
