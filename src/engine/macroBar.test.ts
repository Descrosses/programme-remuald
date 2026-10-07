/**
 * Les barres de macros — ce qu'elles doivent dire, et ce qu'elles ne doivent
 * jamais faire.
 *
 * Le point qui compte le plus : une barre empilée qui ne fait pas exactement
 * 100 % laisse un trou ou déborde. Trois arrondis indépendants donnent 99 ou
 * 101 une fois sur deux ; c'est le défaut que ces tests verrouillent.
 */

import { describe, expect, it } from 'vitest';
import { NUTRITION_TARGETS } from '../data/nutrition';
import { KCAL_PAR_G, macroShare, shareOfDay } from './macroBar';
import { mealMacros, mealsTotal, type Macros } from './nutrition';

const m = (carbsG: number, proteinG: number, fatG: number): Macros => ({
  kcal: carbsG * 4 + proteinG * 4 + fatG * 9,
  carbsG,
  proteinG,
  fatG,
});

describe('la part de chaque macro', () => {
  it('passe par l’énergie, pas par les grammes', () => {
    /* 10 g de lipides valent 90 kcal, 10 g de glucides 40 : à grammes égaux,
       le lipide pèse plus du double. Une barre en grammes mentirait. */
    const s = macroShare(m(10, 10, 10))!;
    // 40 / 40 / 90 kcal sur 170 : 23,5 / 23,5 / 52,9, puis les deux points
    // restants aux plus grosses décimales.
    expect(s).toEqual({ carbs: 24, protein: 23, fat: 53 });
    expect(s.fat).toBeGreaterThan(s.carbs + s.protein - 1);
  });

  it('les trois parts font TOUJOURS exactement 100', () => {
    for (let c = 0; c <= 200; c += 7) {
      for (let p = 0; p <= 120; p += 11) {
        for (let f = 0; f <= 90; f += 13) {
          const s = macroShare(m(c, p, f));
          if (s === null) continue;
          expect(s.carbs + s.protein + s.fat, `${c}/${p}/${f}`).toBe(100);
        }
      }
    }
  });

  it('les points restants vont aux plus grosses décimales', () => {
    // 1/3 chacun : 33,33 trois fois, donc 33+33+33 = 99. Le point en trop va
    // au premier de la liste, pas nulle part.
    const s = macroShare({ kcal: 0, carbsG: 10, proteinG: 10, fatG: 40 / 9 })!;
    expect(s.carbs + s.protein + s.fat).toBe(100);
  });

  it('rien à répartir : pas de barre plutôt qu’une barre vide', () => {
    expect(macroShare(m(0, 0, 0))).toBeNull();
    expect(macroShare({ kcal: 500, carbsG: 0, proteinG: 0, fatG: 0 })).toBeNull();
  });

  it('une valeur aberrante ne produit pas de barre', () => {
    expect(macroShare({ kcal: 0, carbsG: NaN, proteinG: 10, fatG: 5 })).toBeNull();
    expect(macroShare({ kcal: 0, carbsG: Infinity, proteinG: 10, fatG: 5 })).toBeNull();
  });

  it('les valeurs négatives sont ignorées, jamais soustraites', () => {
    // Une étiquette mal recopiée ne doit pas inverser une barre.
    const s = macroShare({ kcal: 0, carbsG: -50, proteinG: 25, fatG: 0 })!;
    expect(s).toEqual({ carbs: 0, protein: 100, fat: 0 });
  });

  it('un seul macro : 100 % pour lui', () => {
    expect(macroShare(m(50, 0, 0))).toEqual({ carbs: 100, protein: 0, fat: 0 });
    expect(macroShare(m(0, 0, 10))).toEqual({ carbs: 0, protein: 0, fat: 100 });
  });

  it('Atwater, et pas une table maison', () => {
    expect(KCAL_PAR_G).toEqual({ carbs: 4, protein: 4, fat: 9 });
  });
});

describe('ce que pèse un repas dans la journée', () => {
  it('rend un pourcentage entier', () => {
    expect(shareOfDay(694, 3226)).toBe(22);
    expect(shareOfDay(578, 3226)).toBe(18);
  });

  it('une journée vide ne divise pas par zéro', () => {
    expect(shareOfDay(500, 0)).toBe(0);
    expect(shareOfDay(500, NaN)).toBe(0);
  });

  it('la somme des parts des repas fait 100, à l’arrondi près', () => {
    for (const t of Object.values(NUTRITION_TARGETS)) {
      const jour = mealsTotal(t).kcal;
      const somme = t.meals.reduce((n, repas) => n + shareOfDay(mealMacros(repas).kcal, jour), 0);
      expect(somme, t.label).toBeGreaterThanOrEqual(99);
      expect(somme, t.label).toBeLessThanOrEqual(101);
    }
  });
});

describe('sur le vrai plan', () => {
  it('une protéine à chaque repas : aucune prise sous 15 % de protéines', () => {
    for (const t of Object.values(NUTRITION_TARGETS)) {
      for (const repas of t.meals) {
        const part = macroShare(mealMacros(repas))!.protein;
        expect(part, `${t.label} — ${repas.name}`).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('chaque repas du plan produit une barre', () => {
    for (const t of Object.values(NUTRITION_TARGETS)) {
      for (const repas of t.meals) {
        expect(macroShare(mealMacros(repas)), `${t.label} — ${repas.name}`).not.toBeNull();
      }
    }
  });

  it('la journée d’entraînement est à dominante glucidique', () => {
    const s = macroShare(mealsTotal(NUTRITION_TARGETS.train))!;
    expect(s.carbs).toBeGreaterThan(s.protein);
    expect(s.carbs).toBeGreaterThan(s.fat);
  });
});
