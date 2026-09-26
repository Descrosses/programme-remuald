/**
 * « La dernière fois, tu as fait ça. »
 *
 * Ce que ça résout : pour savoir ce qu'il avait soulevé la semaine d'avant,
 * Guillaume devait quitter la séance, ouvrir Progrès, retrouver le mouvement,
 * puis revenir. Entre deux séries, avec les mains pleines, personne ne le fait.
 * L'information vient donc à lui, sur la carte de l'exercice.
 *
 * ── D'où vient le chiffre ───────────────────────────────────────────────────
 *
 * De `HistoryIndex`, c'est-à-dire de ce que Guillaume a RÉELLEMENT saisi —
 * exactement la matière que `applyProgression` utilise déjà pour §11. Pas une
 * deuxième requête, pas une deuxième vérité : si les deux divergeaient un jour,
 * l'écran dirait une chose et la suggestion de charge en ferait une autre.
 *
 * La charge planifiée du tableau §9 n'entre jamais ici. Elle dit ce qui était
 * prévu ; cet encart dit ce qui a été fait, et c'est tout son intérêt.
 *
 * ── Ce qu'on ne fait pas ────────────────────────────────────────────────────
 *
 * Aucune flèche rouge, aucun jugement quand la valeur baisse. Une semaine de
 * deload EST une baisse de charge, un ajustement orange aussi : les peindre en
 * rouge apprendrait à Guillaume à ignorer la couleur. La baisse est affichée,
 * simplement, sans mise en forme alarmante.
 *
 * C'est de l'affichage en lecture seule. Rien ici ne touche à §11.
 */

import { fr } from './format';
import type { Occurrence } from './types';
import type { DayIndex } from '../data/types';

/**
 * Mesures où un chiffre plus BAS est meilleur.
 *
 * Un sprint de 1,78 s après 1,84 s est une progression, pas une régression.
 * Sans ça la flèche pointerait à l'envers sur les deux seuls mouvements du
 * programme qui se mesurent au chrono.
 */
export const LOWER_IS_BETTER = new Set(['test-sprint-10m', 'test-sprint-20m']);

export function lowerIsBetter(exerciseId: string): boolean {
  return LOWER_IS_BETTER.has(exerciseId);
}

export type Trend = 'up' | 'flat' | 'down';

/** Une séance : c'est le couple qui identifie une occurrence, pas la semaine. */
export interface Seance {
  week: number;
  day: DayIndex;
}

/** `a` vient-elle strictement avant `b` dans le programme ? */
function estAvant(a: Seance, b: Seance): boolean {
  return a.week !== b.week ? a.week < b.week : a.day < b.day;
}

export interface LastPerformance {
  /** Semaine de la dernière occurrence réelle. */
  week: number;
  /**
   * « 77,5 kg », « 235 cm », et pour un porté les DEUX métriques :
   * « 40 m · 32 kg ».
   */
  value: string;
  /** « RPE 7 », ou `null` quand aucun RPE n'a été saisi ce jour-là. */
  rpe: string | null;
  /**
   * « +2,5 kg », « +10 m · +2 kg » sur un porté dont les deux métriques ont
   * bougé, ou `null` s'il n'y a rien à quoi comparer.
   */
  delta: string | null;
  trend: Trend;
}

/**
 * Une métrique suivie sur ce mouvement.
 *
 * La plupart n'en ont qu'une — des kilos, ou une distance. Les portés en ont
 * DEUX, distance et charge, et les deux progressent : le Suitcase Carry se
 * fait à 32 kg sur 30 m, puis à 32 kg sur 40 m. N'en montrer qu'une revenait à
 * dire la moitié de ce qu'il avait fait.
 */
interface Champ {
  lire: (o: Occurrence) => number | null;
  unit: string;
  /** Le RPE n'a de sens qu'en face d'une charge. */
  avecRPE: boolean;
}

/**
 * La dernière performance réelle, prête à afficher — ou `null`.
 *
 * `null` dans trois cas, et c'est voulu : aucune occurrence enregistrée, aucune
 * occurrence chiffrée (gainage, mobilité — il n'y a rien à comparer et inventer
 * une comparaison serait pire que se taire), ou un exercice qu'on fait pour la
 * première fois. Sur la semaine 1, les neuf exercices afficheraient sinon neuf
 * lignes identiques sans information, qui repousseraient les champs de saisie
 * hors de l'écran.
 */
export function lastPerformance(
  occurrences: Occurrence[] | undefined,
  opts: { exerciseId: string; measureUnit?: string | null; before: Seance },
): LastPerformance | null {
  /*
   * On s'arrête à la SÉANCE en cours, pas à la semaine.
   *
   * Il faut bien s'arrêter quelque part : l'historique est reconstruit à
   * chaque série validée, donc dès la première série du jour, la séance en
   * cours y entre — et l'encart afficherait « Semaine 3 » en parlant de la
   * série que Guillaume vient de faire sous ses yeux.
   *
   * Mais exclure la semaine ENTIÈRE excluait trop : le Broad Jump du samedi
   * ne voyait plus celui du vendredi, deux jours plus tôt, et l'encart
   * disparaissait complètement. C'était le bug. On exclut donc exactement la
   * séance en cours et ce qui vient après, rien de plus.
   *
   * Pas de filtre sur `completed` : ce champ vaut `false` sur les mouvements
   * mesurés, parce qu'un saut n'enregistre pas de reps. Le vrai critère est
   * qu'il y ait une valeur à montrer, et c'est celui qu'on applique plus bas.
   * Une séance sautée ne produit aucune ligne, donc aucune occurrence.
   */
  const faites = (occurrences ?? []).filter((o) => estAvant(o, opts.before));
  if (faites.length === 0) return null;

  const derniere = faites[faites.length - 1]!;
  const champs = champsDe(derniere, opts.measureUnit ?? null);
  if (champs.length === 0) return null;

  const lues = champs
    .map((champ) => ({ champ, valeur: champ.lire(derniere)! }))
    .filter((x) => x.valeur !== null);
  if (lues.length === 0) return null;

  const ecarts = lues.map(({ champ, valeur }) => {
    /*
     * L'occurrence de référence est la dernière AVANT celle-ci qui portait
     * cette métrique — chacune remonte à son propre rythme. On ne va pas plus
     * loin qu'il ne faut : ce qui intéresse Guillaume est « depuis la dernière
     * fois », pas « depuis le début ».
     */
    const precedente = faites
      .slice(0, -1)
      .reverse()
      .find((o) => champ.lire(o) !== null);
    const avant = precedente ? champ.lire(precedente) : null;
    const ecart = avant === null ? null : arrondi(valeur - avant);
    return { champ, ecart, trend: tendance(ecart, opts.exerciseId) };
  });

  /*
   * Avec deux métriques, la flèche suit l'ensemble : verte si au moins une a
   * progressé et qu'aucune n'a reculé. Si l'une monte pendant que l'autre
   * descend — plus loin mais moins lourd — on reste neutre et on affiche les
   * deux écarts : c'est à Guillaume de juger, pas à une flèche.
   */
  const monte = ecarts.some((e) => e.trend === 'up');
  const descend = ecarts.some((e) => e.trend === 'down');
  const trend: Trend = monte && !descend ? 'up' : !monte && descend ? 'down' : 'flat';

  const rpeChamp = lues.find((x) => x.champ.avecRPE);
  const deltas = ecarts
    .filter((e) => e.ecart !== null && e.ecart !== 0)
    .map((e) => `${e.ecart! > 0 ? '+' : '−'}${fr(Math.abs(e.ecart!))} ${e.champ.unit}`);

  return {
    week: derniere.week,
    value: lues.map(({ champ, valeur }) => `${fr(valeur)} ${champ.unit}`).join(' · '),
    rpe: rpeChamp && derniere.rpe !== null ? `RPE ${fr(derniere.rpe)}` : null,
    delta: deltas.length === 0 ? null : deltas.join(' · '),
    trend,
  };
}

/**
 * Les métriques que porte cette occurrence — une, ou deux.
 *
 * La distance d'abord, la charge ensuite : c'est l'ordre dans lequel un porté
 * se décrit, « 40 m à 32 kg », et l'ordre des champs de saisie juste en
 * dessous.
 *
 * Un Speed Squat n'a que des kilos, et pas de RPE cible : il ressort avec sa
 * seule charge, sans RPE. Un Broad Jump n'a qu'une distance. Un Suitcase Carry
 * a les deux, et c'est le cas qui manquait : l'ancienne version choisissait la
 * charge et s'arrêtait là, laissant les 40 m parcourus invisibles.
 */
function champsDe(o: Occurrence, measureUnit: string | null): Champ[] {
  const champs: Champ[] = [];
  if (o.measure !== null && o.measure !== undefined && measureUnit) {
    champs.push({ lire: (x) => x.measure ?? null, unit: measureUnit, avecRPE: false });
  }
  if (o.kg !== null) champs.push({ lire: (x) => x.kg, unit: 'kg', avecRPE: true });
  return champs;
}

/**
 * Monté, stable, ou descendu — du point de vue de la PERFORMANCE.
 *
 * Sur un sprint, les deux derniers sens sont inversés : perdre six centièmes
 * est une progression.
 */
function tendance(ecart: number | null, exerciseId: string): Trend {
  if (ecart === null || ecart === 0) return 'flat';
  const mieux = lowerIsBetter(exerciseId) ? ecart < 0 : ecart > 0;
  return mieux ? 'up' : 'down';
}

/** Deux décimales suffisent, et évitent les 2,4999999999 de la soustraction. */
function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}
