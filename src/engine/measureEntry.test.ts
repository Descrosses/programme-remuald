/**
 * Ce que le champ de mesure propose à l'ouverture, et comment on distingue
 * deux portés qui se ressemblent.
 *
 * Les deux défauts corrigés ici viennent de la même séance :
 *   - valider un Suitcase Carry sans toucher au curseur enregistrait 5 m,
 *     le minimum, au lieu des 30 m du plan ;
 *   - Guillaume a fait le Farmer Carry à la place du Suitcase Carry, parce
 *     que rien ne les distinguait au moment d'attraper les haltères.
 */

import { describe, expect, it } from 'vitest';
import { gripHint } from './format';
import { getSession, hasSession } from './getSession';
import { WEEK_DAYS } from '../data/program';
import { EMPTY_CONTEXT, type Occurrence, type SessionContext } from './types';
import type { DayIndex, WeekIndex } from '../data/types';

const CTX: SessionContext = {
  ...EMPTY_CONTEXT,
  settings: { ...EMPTY_CONTEXT.settings, startDate: '2026-09-14' },
};

const trouve = (week: WeekIndex, day: DayIndex, id: string) =>
  getSession(week, day, CTX)?.exercises.find((e) => e.id === id) ?? null;

const VENDREDI = 4 as DayIndex;
const SAMEDI = 5 as DayIndex;

describe('le plan chiffre la distance des portés', () => {
  it('le Farmer Carry du vendredi prescrit 25 m', () => {
    const ex = trouve(1, VENDREDI, 'farmer-carry')!;
    expect(ex.work).toMatchObject({ kind: 'distance', meters: 25 });
  });

  it('le Suitcase Carry du samedi prescrit 30 m par côté', () => {
    const ex = trouve(1, SAMEDI, 'suitcase-carry')!;
    expect(ex.work).toMatchObject({ kind: 'distance', meters: 30, perSide: true });
  });

  /*
   * La valeur existe donc dans la séance résolue : le champ n'a aucune raison
   * de s'ouvrir sur 5 m. C'est le minimum du curseur, pas une prescription.
   */
  it('aucun porté du programme ne prescrit 5 m', () => {
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

describe('la dernière mesure réellement faite est reprise', () => {
  /** Une occurrence mesurée : un saut n'enregistre pas de reps. */
  const saut = (week: number, cm: number): Occurrence => ({
    exerciseId: 'broad-jump',
    week,
    day: VENDREDI,
    kg: null,
    plannedKg: null,
    rpe: null,
    failed: false,
    targetRPE: null,
    completed: false,
    measure: cm,
  });

  it('un Broad Jump rouvre sur la distance du dernier saut', () => {
    // Le programme ne dit pas à quelle distance sauter : sans cette reprise,
    // le champ repartait de 50 cm à chaque séance.
    const ctx: SessionContext = { ...CTX, history: { 'broad-jump': [saut(1, 248), saut(2, 255)] } };
    const ex = getSession(3, VENDREDI, ctx)!.exercises.find((e) => e.id === 'broad-jump')!;
    expect(ex.lastMeasure).toBe(255);
  });

  it('rien en mémoire : rien à reprendre, le plan ou le minimum prendra le relais', () => {
    expect(trouve(1, VENDREDI, 'broad-jump')!.lastMeasure).toBeNull();
  });

  /*
   * `lastCompleted` ne convient PAS ici : il filtre sur `completed`, qui vaut
   * `false` sur un mouvement mesuré puisqu'aucune rep n'y est enregistrée. La
   * reprise doit chercher la dernière occurrence qui porte une mesure.
   */
  it('marche bien que `completed` soit faux sur les mouvements mesurés', () => {
    const ctx: SessionContext = { ...CTX, history: { 'broad-jump': [saut(1, 248)] } };
    const ex = getSession(2, VENDREDI, ctx)!.exercises.find((e) => e.id === 'broad-jump')!;
    expect(ctx.history['broad-jump']![0]!.completed).toBe(false);
    expect(ex.lastMeasure).toBe(248);
  });
});

describe('une haltère ou deux — le pense-bête', () => {
  it('le Farmer Carry annonce DEUX haltères', () => {
    expect(gripHint(trouve(1, VENDREDI, 'farmer-carry')!.load)).toBe(
      '2 haltères — une dans chaque main',
    );
  });

  it('le Suitcase Carry annonce UNE SEULE haltère', () => {
    expect(gripHint(trouve(1, SAMEDI, 'suitcase-carry')!.load)).toBe(
      '1 SEULE haltère — un côté à la fois',
    );
  });

  it('les deux rappels sont différents — c’est tout l’objet', () => {
    const f = gripHint(trouve(1, VENDREDI, 'farmer-carry')!.load);
    const s = gripHint(trouve(1, SAMEDI, 'suitcase-carry')!.load);
    expect(f).not.toBe(s);
  });

  /*
   * Le rappel est déduit de la forme de charge, jamais écrit exercice par
   * exercice : un mouvement à une haltère ne PEUT donc pas oublier le sien.
   * Ce test le vérifie sur tout le programme plutôt que sur les deux portés.
   */
  it('tout mouvement à une ou deux haltères porte son rappel, partout', () => {
    let vus = 0;
    for (let w = 0; w <= 12; w++) {
      const week = w as WeekIndex;
      for (const day of WEEK_DAYS[week]) {
        if (!hasSession(week, day)) continue;
        for (const ex of getSession(week, day, CTX)?.exercises ?? []) {
          if (ex.load.shape !== 'dbPair' && ex.load.shape !== 'dbSingle') continue;
          expect(gripHint(ex.load), `${ex.id} S${week} j${day}`).not.toBeNull();
          vus += 1;
        }
      }
    }
    expect(vus).toBeGreaterThan(20);
  });

  it('rien sur une barre, une poulie ou le poids du corps', () => {
    // Le rappel ne veut dire quelque chose que là où il y a des haltères.
    for (const [day, id] of [
      [0, 'back-squat'],
      [VENDREDI, 'broad-jump'],
      [VENDREDI, 'explosive-cable-row'],
    ] as Array<[DayIndex, string]>) {
      const ex = trouve(1, day, id);
      if (ex) expect(gripHint(ex.load), id).toBeNull();
    }
  });
});

describe('les consignes écrivent la différence, pas seulement le rappel', () => {
  it('chaque porté renvoie explicitement à l’autre', () => {
    const farmer = trouve(1, VENDREDI, 'farmer-carry')!.def;
    const suitcase = trouve(1, SAMEDI, 'suitcase-carry')!.def;
    expect(`${farmer.intent} ${farmer.cues?.join(' ')}`).toContain('Suitcase Carry');
    expect(`${suitcase.intent} ${suitcase.cues?.join(' ')}`).toContain('Farmer Carry');
  });

  it('et disent pourquoi le Suitcase ne se porte pas à deux mains', () => {
    const suitcase = trouve(1, SAMEDI, 'suitcase-carry')!.def;
    expect(suitcase.cues?.join(' ')).toContain('déséquilibre');
  });
});
