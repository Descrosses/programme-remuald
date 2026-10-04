/**
 * Ce que le champ de mesure propose à l'ouverture, et comment on distingue
 * deux portés qui se ressemblent.
 *
 * Les deux défauts corrigés ici viennent de l'appli dont celle-ci est issue,
 * et se reproduisaient à l'identique :
 *   - valider un porté sans toucher au curseur enregistrait son minimum, 0 m,
 *     au lieu des 20 ou 25 m du plan ;
 *   - le Farmer Carry a été fait à la place du Suitcase Carry, parce que rien
 *     ne les distinguait au moment d'attraper les haltères.
 */

import { describe, expect, it } from 'vitest';
import { gripHint } from './format';
import { getSession, hasSession } from './getSession';
import { WEEK_DAYS } from '../data/program';
import { EMPTY_CONTEXT, type Occurrence, type SessionContext } from './types';
import type { DayIndex, WeekIndex } from '../data/types';

const CTX: SessionContext = {
  ...EMPTY_CONTEXT,
  settings: { ...EMPTY_CONTEXT.settings, startDate: '2026-10-05' },
};

const trouve = (week: WeekIndex, day: DayIndex, id: string) =>
  getSession(week, day, CTX)?.exercises.find((e) => e.id === id) ?? null;

const JEUDI = 3 as DayIndex;
const DIMANCHE = 6 as DayIndex;

describe('le plan chiffre la mesure des portés et de la planche', () => {
  it('le Suitcase Carry du jeudi prescrit 20 m par côté', () => {
    const ex = trouve(1, JEUDI, 'suitcase-carry')!;
    expect(ex.work).toMatchObject({ kind: 'distance', meters: 20, perSide: true });
  });

  it('le Farmer Carry du dimanche prescrit 25 m', () => {
    const ex = trouve(1, DIMANCHE, 'farmer-carry')!;
    expect(ex.work).toMatchObject({ kind: 'distance', meters: 25 });
  });

  /*
   * La valeur existe donc dans la séance résolue : le champ n'a aucune raison
   * de s'ouvrir sur 0. C'est le minimum du curseur, pas une prescription — et
   * avec un pas de 10 m, 25 m n'est même pas atteignable en partant de 0.
   */
  it('aucun porté du programme ne prescrit 0 m', () => {
    for (let w = 0; w <= 12; w++) {
      const week = w as WeekIndex;
      for (const day of WEEK_DAYS[week]) {
        if (!hasSession(week, day)) continue;
        for (const ex of getSession(week, day, CTX)?.exercises ?? []) {
          if (ex.work.kind !== 'distance') continue;
          expect(ex.work.meters, `${ex.id} S${week} j${day}`).toBeGreaterThanOrEqual(15);
        }
      }
    }
  });
});

describe('la dernière mesure réellement faite', () => {
  /** Un porté noté : la distance est là, mais `completed` vaut false. */
  const porte = (week: number, m: number): Occurrence => ({
    exerciseId: 'suitcase-carry',
    week,
    day: JEUDI,
    kg: 24,
    plannedKg: null,
    rpe: null,
    failed: false,
    targetRPE: null,
    completed: false,
    measure: m,
  });

  it('reprend la dernière distance enregistrée', () => {
    const ctx: SessionContext = { ...CTX, history: { 'suitcase-carry': [porte(1, 20), porte(2, 30)] } };
    const ex = getSession(3, JEUDI, ctx)!.exercises.find((e) => e.id === 'suitcase-carry')!;
    expect(ex.lastMeasure).toBe(30);
  });

  it('rien en mémoire : rien à reprendre, le plan prendra le relais', () => {
    expect(trouve(1, JEUDI, 'suitcase-carry')!.lastMeasure).toBeNull();
  });

  /*
   * `lastCompleted` ne convient PAS ici : il filtre sur `completed`, qui vaut
   * `false` sur un mouvement mesuré puisqu'aucune rep n'y est enregistrée. La
   * reprise doit chercher la dernière occurrence qui porte une mesure.
   */
  it('marche bien que `completed` soit faux sur les mouvements mesurés', () => {
    const ctx: SessionContext = { ...CTX, history: { 'suitcase-carry': [porte(1, 20)] } };
    const ex = getSession(2, JEUDI, ctx)!.exercises.find((e) => e.id === 'suitcase-carry')!;
    expect(ctx.history['suitcase-carry']![0]!.completed).toBe(false);
    expect(ex.lastMeasure).toBe(20);
  });
});

describe('une haltère ou deux — le pense-bête', () => {
  it('le Farmer Carry annonce DEUX haltères', () => {
    const ex = trouve(1, DIMANCHE, 'farmer-carry')!;
    expect(gripHint(ex.load, ex.def.grip)).toBe('2 haltères — une dans chaque main');
  });

  it('le Suitcase Carry annonce UNE SEULE haltère', () => {
    const ex = trouve(1, JEUDI, 'suitcase-carry')!;
    expect(gripHint(ex.load, ex.def.grip)).toBe('1 SEULE haltère — un côté à la fois');
  });

  it('les deux rappels sont différents — c’est tout l’objet', () => {
    const f = trouve(1, DIMANCHE, 'farmer-carry')!;
    const s = trouve(1, JEUDI, 'suitcase-carry')!;
    expect(gripHint(f.load, f.def.grip)).not.toBe(gripHint(s.load, s.def.grip));
  });

  /*
   * Le Goblet Squat est chargé comme une paire — c'est ainsi que sa charge
   * s'arrondit — mais se tient à deux mains sur une seule haltère. Déduire le
   * rappel de la seule forme de charge lui ferait annoncer « une dans chaque
   * main », exactement l'erreur que ce rappel existe pour éviter.
   */
  it('le Goblet Squat annonce une haltère tenue à deux mains', () => {
    const ex = trouve(1, 0 as DayIndex, 'goblet-squat')!;
    expect(ex.load.shape).toBe('dbPair');
    expect(gripHint(ex.load, ex.def.grip)).toBe(
      '1 haltère tenue à DEUX mains, contre la poitrine',
    );
  });

  /*
   * Le rappel est déduit de la forme de charge, sauf mention contraire de
   * l'exercice : un mouvement à une ou deux haltères ne PEUT donc pas oublier
   * le sien. Ce test le vérifie sur tout le programme, pas sur deux portés.
   */
  it('tout mouvement à une ou deux haltères porte son rappel, partout', () => {
    let vus = 0;
    for (let w = 0; w <= 12; w++) {
      const week = w as WeekIndex;
      for (const day of WEEK_DAYS[week]) {
        if (!hasSession(week, day)) continue;
        for (const ex of getSession(week, day, CTX)?.exercises ?? []) {
          if (ex.load.shape !== 'dbPair' && ex.load.shape !== 'dbSingle') continue;
          expect(gripHint(ex.load, ex.def.grip), `${ex.id} S${week} j${day}`).not.toBeNull();
          vus += 1;
        }
      }
    }
    expect(vus).toBeGreaterThan(20);
  });

  it('rien sur une barre, une poulie ou le poids du corps', () => {
    // Le rappel ne veut dire quelque chose que là où il y a des haltères.
    for (const [day, id] of [
      [JEUDI, 'rdl'],
      [DIMANCHE, 'one-arm-cable-row'],
      [JEUDI, 'plank'],
    ] as Array<[DayIndex, string]>) {
      const ex = trouve(1, day, id);
      expect(ex, `${id} absent du jour ${day}`).not.toBeNull();
      expect(gripHint(ex!.load, ex!.def.grip), id).toBeNull();
    }
  });
});
