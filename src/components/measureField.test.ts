/**
 * Ce qui s'affiche sur la ligne d'une série : une distance ou des reps, une
 * charge ou rien — appliqué aux exercices du programme Remuald.
 *
 * Le défaut corrigé ici : le Broad Jump du vendredi, « 5 × 2 », affichait REPS
 * et CHARGE·KG à « PDC ». Deux champs, aucun des deux utile — la distance,
 * seule valeur qui progresse sur un saut, n'avait nulle part où être notée.
 * Elle ne l'était qu'en semaine de combine, parce que le champ de mesure était
 * réservé aux exercices de rôle `test`.
 */

import { describe, expect, it } from 'vitest';
import { measureOf, showsLoadField } from './ExerciseCard';
import { getSession, hasSession } from '../engine/getSession';
import { WEEK_DAYS } from '../data/program';
import { EMPTY_CONTEXT, type SessionContext } from '../engine/types';
import type { ResolvedExercise } from '../engine/getSession';
import type { WeekIndex } from '../data/types';

const CTX: SessionContext = {
  ...EMPTY_CONTEXT,
  settings: { ...EMPTY_CONTEXT.settings, startDate: '2026-09-14' },
};

/** Chaque exercice du programme, une seule fois, avec où on l'a trouvé. */
function tousLesExercices(): Map<string, ResolvedExercise> {
  const out = new Map<string, ResolvedExercise>();
  for (let w = 0; w <= 12; w++) {
    const week = w as WeekIndex;
    for (const day of WEEK_DAYS[week]) {
      if (!hasSession(week, day)) continue;
      for (const ex of getSession(week, day, CTX)?.exercises ?? []) {
        if (!out.has(ex.id)) out.set(ex.id, ex);
      }
    }
  }
  return out;
}

const trouve = (id: string): ResolvedExercise => {
  const ex = tousLesExercices().get(id);
  expect(ex, `${id} introuvable dans le programme`).toBeDefined();
  return ex!;
};

describe('programme Remuald — ce qui se mesure en distance ou en temps', () => {
  it('la planche se note en secondes, et garde son champ de lest', () => {
    const planche = trouve('plank');
    expect(measureOf(planche)?.unit).toBe('s');
    expect(showsLoadField(planche)).toBe(true);
  });

  it('un porté garde ses DEUX champs : sa charge existe vraiment', () => {
    for (const id of ['farmer-carry', 'suitcase-carry']) {
      const carry = trouve(id);
      expect(measureOf(carry)?.unit, id).toBe('m');
      expect(showsLoadField(carry), id).toBe(true);
    }
  });

  it('un mouvement au poids du corps sans mesure garde son champ de lest', () => {
    for (const id of ['dead-bug', 'knee-raise']) {
      expect(showsLoadField(trouve(id)), id).toBe(true);
    }
  });

  it('un mouvement chargé garde son champ de charge, et sa mesure reste les reps', () => {
    for (const id of ['goblet-squat', 'bench-press', 'lat-pulldown', 'rdl', 'hip-thrust']) {
      expect(showsLoadField(trouve(id)), id).toBe(true);
      expect(measureOf(trouve(id)), id).toBeNull();
    }
  });
});
