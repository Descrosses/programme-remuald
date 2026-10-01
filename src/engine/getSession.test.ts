/**
 * `getSession` appliqué au programme Remuald : blocs, deload, allègement,
 * forme du jour (orange / rouge) et progression.
 */

import { describe, expect, it } from 'vitest';
import { getSession, type ResolvedExercise, type ResolvedSession } from './getSession';
import { readinessFromAnswers } from './readiness';
import { EMPTY_CONTEXT, type HistoryIndex, type Occurrence, type SessionContext } from './types';
import { rpe, type DayIndex, type RPETarget, type WeekIndex } from '../data/types';

const CTX: SessionContext = {
  ...EMPTY_CONTEXT,
  settings: { ...EMPTY_CONTEXT.settings, startDate: '2026-10-05' },
};

function occ(
  exerciseId: string,
  week: number,
  day: DayIndex,
  kg: number,
  actualRpe: number | null = 7,
  target: RPETarget | null = rpe(7),
): Occurrence {
  return {
    exerciseId,
    week,
    day,
    kg,
    plannedKg: null,
    rpe: actualRpe,
    failed: false,
    targetRPE: target,
    completed: true,
  };
}

/** Un historique où chaque exercice chargé du jour a été fait à `kg`. */
function histoire(entries: Array<[string, number, DayIndex, number]>): HistoryIndex {
  const h: HistoryIndex = {};
  for (const [id, week, day, kg] of entries) (h[id] ??= []).push(occ(id, week, day, kg));
  return h;
}

const seance = (week: number, day: DayIndex, ctx: SessionContext = CTX): ResolvedSession =>
  getSession(week as WeekIndex, day, ctx)!;
const ex = (s: ResolvedSession, id: string): ResolvedExercise | undefined =>
  s.exercises.find((e) => e.id === id);

describe('semaine type (S1-3)', () => {
  it('lundi : Goblet Squat 3 × 8 à RPE 7, et 25 min de zone 2 en fin de séance', () => {
    const s = seance(1, 0);
    const goblet = ex(s, 'goblet-squat')!;
    expect(goblet.sets).toBe(3);
    expect(goblet.targetRPE?.label).toBe('RPE 7');
    const z2 = s.exercises[s.exercises.length - 1]!;
    expect(z2.id).toBe('zone2-cardio');
    expect(z2.work).toEqual({ kind: 'time', seconds: 25 * 60 });
  });

  it('la forme du jour est demandée le lundi et le jeudi, pas le mardi ni le dimanche', () => {
    expect(seance(1, 0).readinessTest).toBe(true);
    expect(seance(1, 3).readinessTest).toBe(true);
    expect(seance(1, 1).readinessTest).toBe(false);
    expect(seance(1, 6).readinessTest).toBe(false);
  });

  it('dimanche : fractionné 8 × (20 s / 70 s)', () => {
    expect(ex(seance(1, 6), 'conditioning')!.work).toEqual({
      kind: 'intervals',
      rounds: 8,
      workSec: 20,
      easySec: 70,
    });
  });
});

describe('force + muscle (S5-7) et muscle + densité (S9-11)', () => {
  it('S5 : exercices principaux en 4 × 5-6, zone 2 à 30 min', () => {
    const lundi = seance(5, 0);
    const squat = ex(lundi, 'back-squat')!;
    expect(squat.sets).toBe(4);
    expect(squat.work).toMatchObject({ kind: 'reps', reps: { min: 5, max: 6 } });
    expect(ex(lundi, 'zone2-cardio')!.work).toEqual({ kind: 'time', seconds: 30 * 60 });
    expect(ex(seance(5, 1), 'bench-press')!.sets).toBe(4);
  });

  it('S5 dimanche : fractionné ramené à 6 × (20 s / 100 s)', () => {
    expect(ex(seance(5, 6), 'conditioning')!.work).toMatchObject({ rounds: 6, easySec: 100 });
  });

  it('S9 : 4 × 6-8 sur les principaux, accessoires 3 × 10-12, zone 2 à 40 min', () => {
    const jeudi = seance(9, 3);
    expect(ex(jeudi, 'rdl')!.work).toMatchObject({ reps: { min: 6, max: 8 } });
    expect(ex(jeudi, 'seated-leg-curl')!.work).toMatchObject({ reps: { min: 10, max: 12 } });
    expect(ex(jeudi, 'zone2-cardio')!.work).toEqual({ kind: 'time', seconds: 40 * 60 });
  });
});

describe('deload (S4, S8) et allègement (S12)', () => {
  const h = histoire([
    ['bench-press', 3, 1, 60],
    ['chest-supported-row', 3, 1, 20],
  ]);

  it('S4 : 2 séries à 80 % de la dernière charge réelle, RPE ≤ 6', () => {
    const s = seance(4, 1, { ...CTX, history: h });
    const bench = ex(s, 'bench-press')!;
    expect(bench.sets).toBe(2);
    expect(bench.load.kg).toBe(47.5); // 60 × 0,8 = 48 → arrondi au 2,5 kg
    expect(bench.targetRPE!.max).toBeLessThanOrEqual(6);
    const row = ex(s, 'chest-supported-row')!;
    expect(row.sets).toBe(2);
    expect(row.load.kg).toBe(16);
  });

  it('S4 : le fractionné disparaît, la zone 2 reste', () => {
    const dimanche = seance(4, 6);
    expect(ex(dimanche, 'conditioning')).toBeUndefined();
    expect(ex(seance(4, 0), 'zone2-cardio')).toBeDefined();
  });

  it('S8 : lundi et mardi allégés, jeudi et dimanche sont des bilans', () => {
    expect(ex(seance(8, 1, { ...CTX, history: h }), 'bench-press')!.sets).toBe(2);
    expect(seance(8, 3).title.startsWith('Combine')).toBe(true);
    expect(seance(8, 6).title.startsWith('Combine')).toBe(true);
  });

  it('S12 : lundi et mardi allégés comme un deload, bilan final jeudi et dimanche', () => {
    const mardi = seance(12, 1, { ...CTX, history: h });
    expect(ex(mardi, 'bench-press')!.sets).toBe(2);
    expect(ex(mardi, 'bench-press')!.load.kg).toBe(47.5);
    expect(seance(12, 3).title).toContain('Combine final');
    expect(seance(12, 6).title).toContain('Combine final');
  });
});

describe('forme du jour', () => {
  const h = histoire([
    ['goblet-squat', 1, 0, 24],
    ['leg-press', 1, 0, 100],
    ['db-rdl', 1, 0, 20],
  ]);

  it('ORANGE : −5 % sur les gros mouvements, une série de moins sur les accessoires', () => {
    const orange = readinessFromAnswers([true, false, false]);
    const s = seance(2, 0, { ...CTX, history: h, readiness: orange });
    expect(ex(s, 'leg-press')!.load.kg).toBe(95);
    expect(ex(s, 'db-rdl')!.sets).toBe(2);
    expect(s.adjustments.some((a) => a.source === 'orange')).toBe(true);
  });

  it('ROUGE : principal en 3 × 3 à 60 % de la dernière charge, tronc et 20 min de zone 2', () => {
    const rouge = readinessFromAnswers([true, true, false]);
    const s = seance(2, 0, { ...CTX, history: h, readiness: rouge });
    const goblet = ex(s, 'goblet-squat')!;
    expect(goblet.sets).toBe(3);
    expect(goblet.load.kg).toBe(14); // 24 × 0,6 = 14,4 → arrondi au 2 kg
    expect(ex(s, 'dead-bug')).toBeDefined();
    expect(ex(s, 'zone2-cardio')!.work).toEqual({ kind: 'time', seconds: 20 * 60 });
    expect(ex(s, 'leg-press')).toBeUndefined();
    expect(ex(s, 'step-up')).toBeUndefined();
  });

  it('ROUGE sans historique : l’appli le dit au lieu d’inventer une charge', () => {
    const rouge = readinessFromAnswers([true, true, true]);
    const goblet = ex(seance(1, 0, { ...CTX, readiness: rouge }), 'goblet-squat')!;
    expect(goblet.load.kg).toBeNull();
    expect(goblet.notes.join(' ')).toContain('moitié');
  });
});

describe('progression (débutant)', () => {
  it('première séance : aucune suggestion, la charge se choisit au RPE', () => {
    expect(ex(seance(1, 1), 'bench-press')!.suggestion).toBeNull();
  });

  it('RPE 6 pour 7 prévu → +2,5 kg la semaine suivante, à confirmer', () => {
    const history: HistoryIndex = { 'bench-press': [occ('bench-press', 1, 1, 50, 6, rpe(7))] };
    const s = ex(seance(2, 1, { ...CTX, history }), 'bench-press')!;
    expect(s.load.kg).toBe(50);
    expect(s.suggestion?.suggestedKg).toBe(52.5);
    expect(s.suggestion?.requiresConfirm).toBe(true);
  });

  it('même très facile, jamais plus de +2,5 kg', () => {
    const history: HistoryIndex = { 'leg-press': [occ('leg-press', 1, 0, 100, 5, rpe(7))] };
    const s = ex(seance(2, 0, { ...CTX, history }), 'leg-press')!;
    expect(s.suggestion?.suggestedKg).toBe(102.5);
  });
});
