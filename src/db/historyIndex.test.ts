/**
 * Une occurrence est une SÉANCE, pas une semaine.
 *
 * Le changement a l'air risqué — `buildHistoryIndex` est la matière première de
 * §11 — mais il ne l'est pas, et ces tests sont là pour le prouver plutôt que
 * de le promettre : un seul mouvement du programme revient deux fois dans la
 * même semaine, le Broad Jump. Pour les quarante autres, une semaine EST une
 * séance, et le regroupement donne exactement ce qu'il donnait avant.
 */

import { describe, expect, it } from 'vitest';
import { buildHistoryIndex } from './repo';
import { getSession, hasSession } from '../engine/getSession';
import { WEEK_DAYS } from '../data/program';
import { EMPTY_CONTEXT, type SessionContext } from '../engine/types';
import type { SetRow } from './db';
import type { DayIndex, WeekIndex } from '../data/types';

let sequence = 0;

/** Une série enregistrée, réduite à ce que l'index regarde. */
const serie = (
  exerciseId: string,
  week: number,
  day: DayIndex,
  patch: Partial<SetRow> = {},
): SetRow => ({
  id: ++sequence,
  sessionId: week * 10 + day,
  exerciseId,
  week,
  day,
  date: '2026-09-14',
  setIndex: 0,
  plannedKg: null,
  plannedReps: null,
  targetRpeMin: null,
  targetRpeMax: null,
  targetRpeLabel: null,
  actualKg: null,
  actualReps: null,
  actualRpe: null,
  measureValue: null,
  failed: false,
  doneAt: 0,
  ...patch,
});

describe('le Broad Jump, vendredi et samedi', () => {
  it('donne DEUX occurrences dans la même semaine, une par séance', () => {
    const index = buildHistoryIndex([
      serie('broad-jump', 2, 4, { measureValue: 250 }),
      serie('broad-jump', 2, 5, { measureValue: 262 }),
    ]);
    expect(index['broad-jump']).toHaveLength(2);
    expect(index['broad-jump']!.map((o) => [o.week, o.day])).toEqual([
      [2, 4],
      [2, 5],
    ]);
  });

  it('chaque séance garde SA meilleure distance, sans se mélanger', () => {
    // Groupées par semaine, les deux séances n'en faisaient qu'une et le
    // samedi héritait du meilleur saut du vendredi.
    const index = buildHistoryIndex([
      serie('broad-jump', 2, 4, { measureValue: 250 }),
      serie('broad-jump', 2, 4, { measureValue: 258 }),
      serie('broad-jump', 2, 5, { measureValue: 240 }),
    ]);
    expect(index['broad-jump']!.map((o) => o.measure)).toEqual([258, 240]);
  });

  it('les occurrences sont triées par semaine PUIS par jour', () => {
    const index = buildHistoryIndex([
      serie('broad-jump', 3, 4, { measureValue: 270 }),
      serie('broad-jump', 2, 5, { measureValue: 262 }),
      serie('broad-jump', 2, 4, { measureValue: 250 }),
      serie('broad-jump', 3, 5, { measureValue: 265 }),
    ]);
    expect(index['broad-jump']!.map((o) => `S${o.week}j${o.day}`)).toEqual([
      'S2j4',
      'S2j5',
      'S3j4',
      'S3j5',
    ]);
  });
});

describe('rien ne change pour les autres mouvements', () => {
  /*
   * La garantie qui rend le changement sûr, et c'est la SEULE formulation
   * exacte : quatorze exercices apparaissent sur plusieurs jours (le bench
   * passe au lundi en semaine 12, les pogos au vendredi en bloc puissance, les
   * tests du combine sont répartis sur la semaine). Mais un seul revient deux
   * fois dans la MÊME semaine, et c'est le seul cas où passer de la semaine à
   * la séance change quoi que ce soit.
   *
   * Si un jour un deuxième mouvement se retrouve deux fois dans une semaine,
   * ce test le dira — et il faudra alors vérifier ce que §11 en fait, au lieu
   * de le découvrir dans les charges proposées.
   */
  it('programme Remuald : seul le cardio en zone 2 revient plusieurs fois dans une semaine', () => {
    const ctx: SessionContext = {
      ...EMPTY_CONTEXT,
      settings: { ...EMPTY_CONTEXT.settings, startDate: '2026-09-14' },
    };
    const parSemaine = new Map<string, Map<number, Set<DayIndex>>>();
    for (let w = 0; w <= 12; w++) {
      const week = w as WeekIndex;
      for (const day of WEEK_DAYS[week]) {
        if (!hasSession(week, day)) continue;
        for (const ex of getSession(week, day, ctx)?.exercises ?? []) {
          const semaines = parSemaine.get(ex.id) ?? parSemaine.set(ex.id, new Map()).get(ex.id)!;
          (semaines.get(week) ?? semaines.set(week, new Set()).get(week)!).add(day);
        }
      }
    }
    const deuxFois = [...parSemaine.entries()]
      .filter(([, semaines]) => [...semaines.values()].some((jours) => jours.size > 1))
      .map(([id]) => id)
      .sort();
    expect(deuxFois).toEqual(['zone2-cardio']);
  });

  it('les autres multi-jours ne se croisent jamais dans la même semaine', () => {
    /*
     * Ceux-là changent bien de jour, mais d'un bloc à l'autre : le bench passe
     * au lundi en semaine 12, les pogos passent au vendredi en semaines 9-11.
     * Leur historique reste continu — une séance par semaine — donc le
     * regroupement par séance leur donne exactement ce que le regroupement par
     * semaine leur donnait.
     */
    const index = buildHistoryIndex([
      serie('pogo-jumps', 8, 0, { actualReps: 10 }),
      serie('pogo-jumps', 9, 4, { actualReps: 10 }),
    ]);
    expect(index['pogo-jumps']).toHaveLength(2);
    expect(index['pogo-jumps']!.map((o) => `S${o.week}j${o.day}`)).toEqual(['S8j0', 'S9j4']);
  });

  it('un mouvement d’un seul jour donne une occurrence par semaine, comme avant', () => {
    const index = buildHistoryIndex([
      serie('back-squat', 1, 0, { actualKg: 77.5, actualRpe: 7, actualReps: 5 }),
      serie('back-squat', 1, 0, { actualKg: 77.5, actualRpe: 7.5, actualReps: 5 }),
      serie('back-squat', 2, 0, { actualKg: 82.5, actualRpe: 7.5, actualReps: 5 }),
    ]);
    expect(index['back-squat']).toHaveLength(2);
    expect(index['back-squat']!.map((o) => o.week)).toEqual([1, 2]);
  });

  it('et il garde exactement ce que §11 lit : charge max, RPE max, échec', () => {
    const index = buildHistoryIndex([
      serie('back-squat', 1, 0, { actualKg: 77.5, actualRpe: 7, actualReps: 5 }),
      serie('back-squat', 1, 0, { actualKg: 80, actualRpe: 8.5, actualReps: 4, failed: true }),
    ]);
    const o = index['back-squat']![0]!;
    expect(o.kg).toBe(80);
    expect(o.rpe).toBe(8.5);
    expect(o.failed).toBe(true);
    expect(o.completed).toBe(true);
  });
});

describe('ce qui n’entre pas dans l’index', () => {
  it('une série sans aucune valeur est ignorée', () => {
    expect(buildHistoryIndex([serie('back-squat', 1, 0)])['back-squat']).toBeUndefined();
  });

  it('un saut n’a pas de reps, et reste pourtant enregistré', () => {
    // `completed` vaut `false` sur un saut : c'est le piège que
    // `lastPerformance` contourne en ne filtrant pas dessus.
    const o = buildHistoryIndex([serie('broad-jump', 1, 4, { measureValue: 250 })])[
      'broad-jump'
    ]![0]!;
    expect(o.measure).toBe(250);
    expect(o.completed).toBe(false);
  });
});
