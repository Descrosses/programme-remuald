/**
 * Ce qui a réellement été mangé, et ce qu'il en reste.
 *
 * Le principe que ces tests protègent : on ne saisit RIEN de plus. Les
 * corrections d'étiquette et les remplacements sont déjà ce qui a été mangé ;
 * cocher un repas dit seulement « celui-là, je l'ai pris ».
 */

import { describe, expect, it } from 'vitest';
import { NUTRITION_TARGETS } from '../data/nutrition';
import {
  consumedTotal,
  mealMacros,
  mealsTotal,
  progressPct,
  remainingTotal,
  type FoodOverrides,
} from './nutrition';

const TRAIN = NUTRITION_TARGETS.train;
const PREVU = mealsTotal(TRAIN);
const ids = TRAIN.meals.map((m) => m.id);

describe('le total de ce qui a été pris', () => {
  it('rien de coché : zéro, et tout reste à manger', () => {
    const c = consumedTotal(TRAIN, new Set());
    expect(c).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    expect(remainingTotal(PREVU, c)).toEqual(PREVU);
  });

  it('tout coché : exactement le plan, et plus rien à manger', () => {
    const c = consumedTotal(TRAIN, new Set(ids));
    expect(c).toEqual(PREVU);
    expect(remainingTotal(PREVU, c)).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it('un repas coché apporte ses macros, et elles seules', () => {
    const dejeuner = TRAIN.meals.find((m) => m.id === 'x.midi')!;
    const c = consumedTotal(TRAIN, new Set([dejeuner.id]));
    expect(c).toEqual(mealMacros(dejeuner));
  });

  it('les repas s’additionnent, dans n’importe quel ordre', () => {
    const [a, b] = [ids[0]!, ids[3]!];
    const ensemble = consumedTotal(TRAIN, new Set([a, b]));
    const separe = consumedTotal(TRAIN, new Set([b, a]));
    expect(ensemble).toEqual(separe);
    expect(ensemble.kcal).toBe(
      mealMacros(TRAIN.meals[0]!).kcal + mealMacros(TRAIN.meals[3]!).kcal,
    );
  });

  it('un identifiant inconnu ne compte rien et ne casse rien', () => {
    // Une coche laissée par une version précédente, ou un repas renommé.
    expect(consumedTotal(TRAIN, new Set(['n.existe.pas'])).kcal).toBe(0);
  });

  /*
   * Le point central : ce qui est compté suit les corrections, sans que rien
   * d'autre soit saisi. Remplacer la viande par du saumon change ce qu'on a
   * mangé, donc ce qui est compté.
   */
  it('ce qui est compté suit les corrections d’étiquette', () => {
    const dejeuner = TRAIN.meals.find((m) => m.id === 'x.midi')!;
    const viande = dejeuner.items!.find((i) => i.product === 'viande')!;
    const ov: FoodOverrides = { [viande.id]: { productId: 'saumon' } };

    const sans = consumedTotal(TRAIN, new Set([dejeuner.id]));
    const avec = consumedTotal(TRAIN, new Set([dejeuner.id]), ov);
    expect(avec.kcal).toBeGreaterThan(sans.kcal);
    expect(avec).toEqual(mealMacros(dejeuner, ov));
  });

  it('une quantité corrigée compte pour ce qu’elle vaut', () => {
    const dejeuner = TRAIN.meals.find((m) => m.id === 'x.midi')!;
    const feculent = dejeuner.items!.find((i) => i.product === 'feculent')!;
    const doublé = consumedTotal(TRAIN, new Set([dejeuner.id]), { [feculent.id]: { qty: 400 } });
    expect(doublé.kcal).toBeGreaterThan(consumedTotal(TRAIN, new Set([dejeuner.id])).kcal);
  });

  it('le plan modèle n’est jamais touché', () => {
    const avant = JSON.stringify(TRAIN);
    consumedTotal(TRAIN, new Set(ids));
    expect(JSON.stringify(TRAIN)).toBe(avant);
  });
});

describe('ce qu’il reste', () => {
  it('un dépassement rend des valeurs négatives, pas zéro', () => {
    // « Il reste −180 kcal » est une information ; « il reste 0 » en est une
    // autre, et fausse.
    const c = { kcal: 3500, proteinG: 200, carbsG: 420, fatG: 100 };
    const r = remainingTotal(PREVU, c);
    expect(r.kcal).toBeLessThan(0);
    expect(r.proteinG).toBeLessThan(0);
  });
});

describe('le remplissage d’une barre', () => {
  it('la moitié du prévu remplit la moitié', () => {
    expect(progressPct(200, 400)).toBe(50);
  });

  it('pile le prévu remplit tout', () => {
    expect(progressPct(402, 402)).toBe(100);
  });

  /*
   * Un dépassement doit SE VOIR. Le ravaler à 100 % ferait d'une journée à
   * +400 kcal la même image qu'une journée pile dans la cible.
   */
  it('un dépassement dépasse 100', () => {
    expect(progressPct(500, 400)).toBe(125);
    expect(progressPct(900, 400)).toBe(200); // borné, le chiffre prend le relais
    expect(progressPct(99999, 400)).toBe(200);
  });

  it('rien de prévu, rien à remplir', () => {
    expect(progressPct(100, 0)).toBe(0);
    expect(progressPct(NaN, 400)).toBe(0);
    expect(progressPct(100, NaN)).toBe(0);
  });

  it('une valeur négative ne vide pas la barre sous zéro', () => {
    expect(progressPct(-50, 400)).toBe(0);
  });
});

describe('les deux paliers', () => {
  it('chaque repas a un identifiant stable et unique', () => {
    for (const t of Object.values(NUTRITION_TARGETS)) {
      const vus = t.meals.map((m) => m.id);
      expect(new Set(vus).size, t.label).toBe(vus.length);
      for (const id of vus) expect(id, t.label).toMatch(/^[trx]\./);
    }
  });

  /*
   * La prise d'avant 8 h 15 est le MÊME objet aux deux paliers : son identifiant
   * commence par « x ». La cocher un jour de repos et consulter le palier
   * entraînement doit la montrer cochée — c'est la même prise, prise une fois.
   */
  it('la prise commune aux deux paliers porte le même identifiant', () => {
    const t = NUTRITION_TARGETS.train.meals.find((m) => m.name === 'Avant 8 h 15')!;
    const r = NUTRITION_TARGETS.rest.meals.find((m) => m.name === 'Avant 8 h 15')!;
    expect(t.id).toBe(r.id);
    expect(t.id.startsWith('x.')).toBe(true);
  });
});
