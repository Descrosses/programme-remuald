/**
 * De quoi une assiette est faite — la part de chaque macro dans son énergie.
 *
 * ── Pourquoi ce calcul et pas un autre ──────────────────────────────────────
 *
 * Un repas se lit en grammes, mais une barre se lit en proportions. « 92 g de
 * glucides et 7 g de lipides » ne dit pas qu'on est à 53 % de glucides et 9 %
 * de lipides : il faut passer par l'énergie, parce qu'un gramme de lipide pèse
 * plus du double d'un gramme de glucide.
 *
 * ── Pourquoi on ne part PAS des kcal annoncées ──────────────────────────────
 *
 * Les kcal du plan sont des valeurs d'étiquette, pas la somme 4/4/9 de leurs
 * macros : le .md l'assume, et l'écart atteint quelques pour cent. Rapporter
 * l'énergie des macros à ces kcal-là donnerait un total qui ne fait pas 100,
 * et une barre qui ne se remplit pas.
 *
 * On calcule donc la part de chaque macro DANS L'ÉNERGIE DES MACROS, ce qui est
 * exactement ce que la barre montre. Les kcal affichées à côté restent celles
 * du plan — les deux répondent à deux questions différentes.
 */

import type { Macros } from './nutrition';

/** Atwater : ce que vaut un gramme de chaque macro. */
export const KCAL_PAR_G = { carbs: 4, protein: 4, fat: 9 } as const;

/** Part de chaque macro dans l'énergie, en pourcentages entiers qui font 100. */
export interface MacroShare {
  carbs: number;
  protein: number;
  fat: number;
}

/**
 * Les trois parts, ou `null` quand il n'y a rien à répartir.
 *
 * Les pourcentages sont entiers ET somment exactement à 100, par la méthode des
 * plus forts restes. Trois arrondis indépendants donneraient 99 ou 101, et une
 * barre qui laisse un pixel de vide ou qui déborde.
 */
export function macroShare(m: Macros): MacroShare | null {
  const kcal = {
    carbs: Math.max(0, m.carbsG) * KCAL_PAR_G.carbs,
    protein: Math.max(0, m.proteinG) * KCAL_PAR_G.protein,
    fat: Math.max(0, m.fatG) * KCAL_PAR_G.fat,
  };
  const total = kcal.carbs + kcal.protein + kcal.fat;
  if (!Number.isFinite(total) || total <= 0) return null;

  const brut = {
    carbs: (kcal.carbs / total) * 100,
    protein: (kcal.protein / total) * 100,
    fat: (kcal.fat / total) * 100,
  };
  const bas = {
    carbs: Math.floor(brut.carbs),
    protein: Math.floor(brut.protein),
    fat: Math.floor(brut.fat),
  };

  /* Les points qui restent vont aux plus grosses décimales, dans l'ordre. */
  let reste = 100 - (bas.carbs + bas.protein + bas.fat);
  const ordre = (['carbs', 'protein', 'fat'] as const)
    .map((k) => ({ k, frac: brut[k] - bas[k] }))
    .sort((a, b) => b.frac - a.frac);
  const out = { ...bas };
  for (const { k } of ordre) {
    if (reste <= 0) break;
    out[k] += 1;
    reste -= 1;
  }
  return out;
}

/**
 * Ce que ce repas pèse dans la journée, en pourcentage entier.
 *
 * C'est l'autre question que pose la capture dont Guillaume est parti : non pas
 * « de quoi ce repas est fait » mais « combien il compte ». Les deux se lisent
 * ensemble, et aucune ne remplace l'autre.
 */
export function shareOfDay(mealKcal: number, dayKcal: number): number {
  if (!Number.isFinite(mealKcal) || !Number.isFinite(dayKcal) || dayKcal <= 0) return 0;
  return Math.round((Math.max(0, mealKcal) / dayKcal) * 100);
}
