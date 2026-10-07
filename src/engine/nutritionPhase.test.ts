/**
 * La nutrition suit la périodisation — programme Remuald.
 *
 * Remuald est en perte de poids : il est déjà en déficit toute l'année. Une
 * semaine allégée ne baisse donc PAS ses quantités (`DELOAD_QUANTITIES` est
 * vide) : la récupération en a besoin. Seul un bandeau l'en informe.
 *
 * Ce que ces tests protègent :
 *   - les semaines 4 et 8 sont bien reconnues comme allégées ;
 *   - les jours de bilan (jeudi et dimanche de la semaine 8) restent normaux ;
 *   - la semaine 12 n'est jamais allégée ;
 *   - en semaine allégée, l'assiette ne change pas d'un gramme.
 */

import { describe, expect, it } from 'vitest';
import { DELOAD_BANNER, DELOAD_QUANTITIES, NUTRITION_TARGETS, type NutritionTarget } from '../data/nutrition';
import { WEEK_BLOCKS } from '../data/program';
import { mealsTotal, phaseForDay, targetForPhase } from './nutrition';
import type { DayIndex, WeekIndex } from '../data/types';

const TRAIN = NUTRITION_TARGETS.train;
const REST = NUTRITION_TARGETS.rest;

const LUNDI = 0 as DayIndex;
const MARDI = 1 as DayIndex;
const JEUDI = 3 as DayIndex;
const DIMANCHE = 6 as DayIndex;

describe('quelle phase, quel jour', () => {
  it('hors semaines 4 et 8, rien ne change', () => {
    for (const w of [1, 2, 3, 5, 6, 7, 9, 10, 11] as WeekIndex[]) {
      expect(phaseForDay(w, LUNDI), `semaine ${w}`).toBe('normal');
    }
  });

  it('les semaines 4 et 8 sont des semaines allégées', () => {
    expect(phaseForDay(4 as WeekIndex, LUNDI)).toBe('deloadLight');
    expect(phaseForDay(4 as WeekIndex, JEUDI)).toBe('deloadLight');
    expect(phaseForDay(8 as WeekIndex, LUNDI)).toBe('deloadLight');
    expect(phaseForDay(8 as WeekIndex, MARDI)).toBe('deloadLight');
  });

  it('les jours de bilan de la semaine 8 (jeudi, dimanche) restent normaux', () => {
    expect(phaseForDay(8 as WeekIndex, JEUDI)).toBe('normal');
    expect(phaseForDay(8 as WeekIndex, DIMANCHE)).toBe('normal');
  });

  it('la semaine 12 n’est jamais allégée, aucun jour', () => {
    for (const d of [0, 1, 3, 6] as DayIndex[]) {
      expect(phaseForDay(12 as WeekIndex, d), `jour ${d}`).toBe('normal');
    }
    expect(phaseForDay(12 as WeekIndex, null)).toBe('normal');
    expect(WEEK_BLOCKS[12]).toBe('taper');
  });

  it('les jours sans séance d’une semaine allégée sont concernés aussi', () => {
    expect(phaseForDay(4 as WeekIndex, null)).toBe('deloadLight');
    expect(phaseForDay(1 as WeekIndex, null)).toBe('normal');
  });

  it('hors programme, rien ne s’applique', () => {
    expect(phaseForDay(null, LUNDI)).toBe('normal');
    expect(phaseForDay(null, null)).toBe('normal');
  });
});

describe('en semaine allégée, l’assiette ne change pas', () => {
  it('aucune quantité allégée : Remuald est déjà en déficit', () => {
    expect(Object.keys(DELOAD_QUANTITIES)).toEqual([]);
  });

  it('les deux paliers restent l’objet d’origine, à l’identique', () => {
    expect(targetForPhase(TRAIN, 'deloadLight')).toBe(TRAIN);
    expect(targetForPhase(REST, 'deloadLight')).toBe(REST);
    expect(targetForPhase(TRAIN, 'normal')).toBe(TRAIN);
  });

  it('aucune ligne n’est marquée allégée', () => {
    for (const t of [TRAIN, REST]) {
      expect(lignes(targetForPhase(t, 'deloadLight')).some((i) => i.adjusted)).toBe(false);
    }
  });

  it('le bandeau le dit clairement', () => {
    expect(DELOAD_BANNER.text).toContain('ne change pas');
  });
});

describe('le mécanisme reste disponible si le coach décide d’alléger', () => {
  it('une quantité allégée se répercute sur la cible, qui est recalculée', () => {
    const allege = targetForPhase(TRAIN, 'deloadLight', { 'x.diner.feculent': 100 });
    expect(lignes(allege).find((i) => i.id === 'x.diner.feculent')!.qty).toBe(100);
    expect(lignes(allege).find((i) => i.id === 'x.diner.feculent')!.adjusted).toBe('deloadLight');
    expect(allege.kcal).toBeLessThan(TRAIN.kcal);
    expect(mealsTotal(allege).kcal).toBe(allege.kcal);
    // Le palier d'origine n'est jamais réécrit.
    expect(lignes(TRAIN).find((i) => i.id === 'x.diner.feculent')!.qty).toBe(150);
  });

  it('une correction saisie à la main prime sur l’ajustement', () => {
    const allege = targetForPhase(TRAIN, 'deloadLight', { 'x.diner.feculent': 100 });
    const avec = mealsTotal(allege, { 'x.diner.feculent': { qty: 200 } });
    expect(avec.kcal).toBeGreaterThan(allege.kcal);
  });
});

function lignes(t: NutritionTarget) {
  return t.meals.flatMap((m) => m.items ?? []);
}
