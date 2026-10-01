/**
 * Tableau des charges semaine par semaine — VIDE pour ce programme.
 *
 * Remuald est débutant : il n'a pas de 1RM testé, et le modèle interdit de
 * calculer une charge d'entraînement sur une estimation. Toutes ses charges se
 * règlent au RPE à la première séance, puis §11 les fait progresser à partir
 * de ce qu'il a réellement soulevé (`autoreg` dans `baseSessions.ts`).
 *
 * Le mécanisme est conservé (types, `prescriptionFor`) pour qu'un futur
 * programme à charges écrites puisse le réutiliser sans toucher à l'engine.
 */

import type { LiftSchedule, MainLiftTable, MainLiftId, WeekPrescription } from './types';

const vide = (): LiftSchedule => Array.from({ length: 12 }, () => null);

export const MAIN_LIFT_TABLE: MainLiftTable = {
  'back-squat': vide(),
  'bench-press': vide(),
  deadlift: vide(),
  'weighted-pullup': vide(),
  'push-press': vide(),
  'front-squat': vide(),
  'speed-squat': vide(),
  rdl: vide(),
};

/** Prescription du tableau pour une semaine donnée (toujours `null` ici). */
export function prescriptionFor(lift: MainLiftId, week: number): WeekPrescription | null {
  if (week < 1 || week > 12) return null;
  return MAIN_LIFT_TABLE[lift][week - 1] ?? null;
}
