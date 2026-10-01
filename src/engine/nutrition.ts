/**
 * Suivi de poids et suggestion d'ajustement alimentaire.
 *
 * Le .md le dit sans ambiguïté : « On ne regarde jamais une pesée isolée — elle
 * bouge de 1-2 kg selon l'hydratation, le sel de la veille, le transit. On ne
 * regarde que la moyenne des 7 derniers jours. » Tout ce fichier découle de
 * cette phrase : aucune fonction ne lit une pesée seule.
 *
 * Même forme que `trends.ts` pour les sauts — fenêtre glissante, seuil, nombre
 * de semaines consécutives — mais appliquée au poids.
 */

import {
  FUEL_ADVICE,
  FUEL_BY_TRAINING_DAY,
  MEALS_GAP_TOLERANCE_PCT,
  TARGET_GAIN_KG_PER_WEEK,
  type FoodItem,
  type FuelAdvice,
  type Meal,
  type NutritionTarget,
} from '../data/nutrition';
import type { DayIndex } from '../data/types';

/** Une pesée du matin, et éventuellement le tour de taille du jour. */
export interface Measurement {
  /** `YYYY-MM-DD`. */
  date: string;
  weightKg: number | null;
  waistCm: number | null;
}

/**
 * Seuils d'ajustement, transcrits du .md.
 *
 * Le .md donne des fourchettes (« moins de 150-200 g », « plus de 400-500 g »,
 * « 2-3 semaines »). Il faut bien trancher pour coder. On retient à chaque fois
 * le bord PRUDENT, c'est-à-dire celui qui pousse le moins à manger davantage :
 *
 * - stable = 150 g et non 200 g : on est plus exigeant avant de déclarer le
 *   poids bloqué, donc on ajoute du féculent moins facilement ;
 * - stable sur 3 semaines et non 2 : trois points valent mieux que deux pour
 *   distinguer un plateau d'un simple creux ;
 * - prise rapide = 400 g et non 500 g, sur 2 semaines et non 3 : là le bord
 *   prudent est l'inverse, on corrige tôt une prise qui part trop vite.
 */
export const ADJUST_RULES = {
  /** Variation hebdomadaire en deçà de laquelle le poids est jugé stable. */
  stableKg: 0.15,
  stableWeeks: 3,
  /**
   * Programme Remuald (perte de poids) : perte hebdomadaire au-delà de
   * laquelle on remet à manger — 1 % du poids de départ.
   */
  fastLossKg: 1.1,
  fastLossWeeks: 2,
} as const;

const MS_PER_DAY = 86_400_000;

function time(iso: string): number {
  return Date.parse(`${iso}T12:00:00Z`);
}

function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Moyenne des pesées tombant dans la fenêtre `]endIso − days ; endIso]`.
 *
 * `null` si la fenêtre est vide. Une seule pesée suffit : le .md prévoit
 * explicitement le cas de la pesée hebdomadaire unique (« moins précis mais
 * reste utilisable »), ça ne doit pas bloquer le calcul.
 */
export function windowAverage(
  entries: Measurement[],
  endIso: string,
  days = 7,
): number | null {
  const end = time(endIso);
  const start = end - days * MS_PER_DAY;
  const values = entries
    .filter((e) => e.weightKg !== null && time(e.date) > start && time(e.date) <= end)
    .map((e) => e.weightKg!);
  if (values.length === 0) return null;
  return round(values.reduce((a, b) => a + b, 0) / values.length);
}

export interface WeeklyPoint {
  /** 0 = semaine qui se termine aujourd'hui, 1 = la précédente, etc. */
  weeksAgo: number;
  /** Dernier jour de la fenêtre. */
  endDate: string;
  average: number | null;
}

/** Moyennes glissantes des `count` dernières semaines, de la plus récente à la plus ancienne. */
export function weeklyAverages(
  entries: Measurement[],
  todayIso: string,
  count: number,
): WeeklyPoint[] {
  const out: WeeklyPoint[] = [];
  for (let w = 0; w < count; w++) {
    const endDate = new Date(time(todayIso) - w * 7 * MS_PER_DAY).toISOString().slice(0, 10);
    out.push({ weeksAgo: w, endDate, average: windowAverage(entries, endDate) });
  }
  return out;
}

export interface WeightTrend {
  /** Moyenne des 7 derniers jours. */
  average7: number | null;
  /** Moyenne des 7 jours d'avant, pour la comparaison exigée par le .md. */
  previous7: number | null;
  /** `average7 − previous7`, en kg. */
  deltaKg: number | null;
  /** Nombre de pesées dans les 7 derniers jours — dit la fiabilité de la moyenne. */
  countThisWeek: number;
  /** La progression est dans la fourchette visée (+0,15 à +0,30 kg/semaine). */
  onTarget: boolean;
}

export function weightTrend(entries: Measurement[], todayIso: string): WeightTrend {
  const average7 = windowAverage(entries, todayIso, 7);
  const previous7 = windowAverage(
    entries,
    new Date(time(todayIso) - 7 * MS_PER_DAY).toISOString().slice(0, 10),
    7,
  );
  const deltaKg = average7 !== null && previous7 !== null ? round(average7 - previous7) : null;
  const countThisWeek = entries.filter(
    (e) =>
      e.weightKg !== null &&
      time(e.date) > time(todayIso) - 7 * MS_PER_DAY &&
      time(e.date) <= time(todayIso),
  ).length;

  return {
    average7,
    previous7,
    deltaKg,
    countThisWeek,
    onTarget:
      deltaKg !== null &&
      deltaKg >= TARGET_GAIN_KG_PER_WEEK.min &&
      deltaKg <= TARGET_GAIN_KG_PER_WEEK.max,
  };
}

/** Tour de taille le plus récent d'une fenêtre, `null` si aucun. */
export function latestWaist(entries: Measurement[], onOrBeforeIso?: string): number | null {
  const limit = onOrBeforeIso ? time(onOrBeforeIso) : Infinity;
  const candidates = entries
    .filter((e) => e.waistCm !== null && time(e.date) <= limit)
    .sort((a, b) => time(b.date) - time(a.date));
  return candidates[0]?.waistCm ?? null;
}

export type AdviceKind = 'add' | 'remove' | 'none';

export interface NutritionAdvice {
  kind: AdviceKind;
  /** Titre court, celui qu'on lit en premier. */
  title: string;
  /** L'action, en une phrase. */
  action: string;
  /** Nombre de semaines consécutives qui ont déclenché la règle. */
  weeks: number;
}

const NO_ADVICE: NutritionAdvice = { kind: 'none', title: '', action: '', weeks: 0 };

/**
 * §« Règle d'ajustement » du .md, appliquée à la moyenne glissante.
 *
 * Ne se prononce jamais sur une pesée isolée ni sur une seule semaine : il faut
 * `stableWeeks` (ou `fastGainWeeks`) variations hebdomadaires consécutives qui
 * vont toutes dans le même sens. Si les données manquent sur une seule de ces
 * semaines, on ne dit rien plutôt que de conseiller à l'aveugle.
 */
export function nutritionAdvice(entries: Measurement[], todayIso: string): NutritionAdvice {
  const needed = Math.max(ADJUST_RULES.stableWeeks, ADJUST_RULES.fastLossWeeks) + 1;
  const points = weeklyAverages(entries, todayIso, needed);

  /** Variation de la semaine `i` par rapport à la précédente. `null` si trou. */
  const delta = (i: number): number | null => {
    const a = points[i]?.average;
    const b = points[i + 1]?.average;
    return a != null && b != null ? round(a - b) : null;
  };

  // Perte trop rapide d'abord : au-delà de 1 % par semaine, on perd du muscle
  // et on prépare l'effet yo-yo. Les deux cas s'excluent.
  const fast = Array.from({ length: ADJUST_RULES.fastLossWeeks }, (_, i) => delta(i));
  if (fast.every((d) => d !== null && d < -ADJUST_RULES.fastLossKg)) {
    return {
      kind: 'add',
      weeks: ADJUST_RULES.fastLossWeeks,
      title: `Perte trop rapide depuis ${ADJUST_RULES.fastLossWeeks} semaines`,
      action: 'Ajoute 50 g de féculent au dîner. Perdre plus vite ferait fondre du muscle.',
    };
  }

  const stable = Array.from({ length: ADJUST_RULES.stableWeeks }, (_, i) => delta(i));
  if (stable.every((d) => d !== null && Math.abs(d) <= ADJUST_RULES.stableKg)) {
    return {
      kind: 'remove',
      weeks: ADJUST_RULES.stableWeeks,
      title: `Poids stable depuis ${ADJUST_RULES.stableWeeks} semaines`,
      action: 'Retire 50 g de féculent au dîner.',
    };
  }

  return NO_ADVICE;
}

// ---------------------------------------------------------------------------
// Bonus glucidique du jour
// ---------------------------------------------------------------------------

/**
 * Niveau de carburant recommandé aujourd'hui.
 *
 * Deux entrées seulement, et les deux viennent du calendrier d'entraînement
 * existant : le jour de programme d'une séance prévue, ou `null` s'il n'y en a
 * pas. Aucune liste de jours de la semaine n'est maintenue en parallèle.
 *
 * Le repli en `standard` couvre un cas que la table de Guillaume ne prévoit
 * pas : les semaines de combine posent des séances un mardi ou un jeudi, jours
 * qui n'existent pas dans une semaine d'entraînement normale. Annoncer « jour
 * de récupération » un jour où il va tester son 1RM serait absurde ; on affiche
 * donc le plan de base sans bonus plutôt que rien.
 */
export function fuelForToday(day: DayIndex | null): FuelAdvice {
  if (day === null) return FUEL_ADVICE.rest;
  return FUEL_ADVICE[FUEL_BY_TRAINING_DAY[day] ?? 'standard'];
}

/**
 * Densité du féculent cuit retenue par le plan : 1 kcal par gramme.
 *
 * Ce n'est pas une valeur de table de composition — le riz cuit est à ~1,3, les
 * pâtes à ~1,6, la pomme de terre à ~0,9. C'est le taux que le .md s'applique à
 * lui-même : son déjeuner et son dîner ne diffèrent que de 50 g de féculent et
 * de 50 kcal. Reprendre son taux garde le conseil cohérent avec les portions
 * qu'il écrit, au lieu d'y mêler une précision qu'il ne revendique pas.
 */
export const COOKED_STARCH_KCAL_PER_G = 1;

/**
 * Combien de féculent cuit il faudrait ajouter pour combler l'écart, arrondi à
 * 50 g. Calculé et non écrit en dur : changer une portion du plan doit changer
 * ce conseil, sinon l'écran affirme deux choses incompatibles.
 */
export function starchToCloseGap(gapKcal: number): number {
  return Math.round(Math.abs(gapKcal) / COOKED_STARCH_KCAL_PER_G / 50) * 50;
}

// ---------------------------------------------------------------------------
// Totaux d'un repas, de ses aliments, et valeurs modifiées par Guillaume
// ---------------------------------------------------------------------------

/**
 * Ce que Guillaume a changé sur un aliment, par rapport au .md.
 *
 * Tous les champs sont optionnels : changer la seule quantité ne doit pas
 * obliger à recopier la composition. Ce qui n'est pas là vient de l'aliment
 * d'origine, donc corriger le .md profite aux champs non modifiés.
 */
export interface FoodOverride {
  qty?: number;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

/** Valeurs modifiées, rangées par identifiant d'aliment. */
export type FoodOverrides = Record<string, FoodOverride>;

export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * L'aliment tel qu'il compte vraiment : le .md, corrigé de ce qu'a saisi
 * Guillaume.
 *
 * Deux clés, et c'est essentiel : la QUANTITÉ est rangée sous l'identifiant de
 * la ligne, la COMPOSITION sous celui du produit. Changer de marque de pain se
 * saisit donc une fois et vaut pour les quatre lignes de pain du plan, alors
 * que mettre une tranche de plus au réveil ne touche qu'au réveil.
 *
 * Tout mettre sous une seule clé donnait le choix entre retaper une étiquette
 * quatre fois et voir une quantité se propager là où elle n'a rien à faire.
 */
export function effectiveItem(item: FoodItem, overrides: FoodOverrides = {}): FoodItem {
  const surLigne = overrides[item.id];
  const surProduit = overrides[item.product];
  if (!surLigne && !surProduit) return item;
  return {
    ...item,
    qty: surLigne?.qty ?? item.qty,
    kcal: surProduit?.kcal ?? item.kcal,
    proteinG: surProduit?.proteinG ?? item.proteinG,
    carbsG: surProduit?.carbsG ?? item.carbsG,
    fatG: surProduit?.fatG ?? item.fatG,
  };
}

/** Les deux clés sous lesquelles se range une correction de cette ligne. */
export const CLE_QUANTITE = (item: FoodItem): string => item.id;
export const CLE_COMPOSITION = (item: FoodItem): string => item.product;

/** Cet aliment est-il modifié par rapport au .md ? */
export function isEdited(item: FoodItem, overrides: FoodOverrides = {}): boolean {
  const e = effectiveItem(item, overrides);
  return (
    e.qty !== item.qty ||
    e.kcal !== item.kcal ||
    e.proteinG !== item.proteinG ||
    e.carbsG !== item.carbsG ||
    e.fatG !== item.fatG
  );
}

/**
 * Ce qu'apporte une ligne d'aliment. Non arrondi : arrondir ici puis
 * additionner ferait dériver le total du repas de plusieurs kcal.
 */
export function itemMacros(item: FoodItem, overrides: FoodOverrides = {}): Macros {
  const e = effectiveItem(item, overrides);
  const f = e.qty / e.per;
  return { kcal: e.kcal * f, proteinG: e.proteinG * f, carbsG: e.carbsG * f, fatG: e.fatG * f };
}

const ZERO: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
const somme = (a: Macros, b: Macros): Macros => ({
  kcal: a.kcal + b.kcal,
  proteinG: a.proteinG + b.proteinG,
  carbsG: a.carbsG + b.carbsG,
  fatG: a.fatG + b.fatG,
});
const arrondir = (m: Macros): Macros => ({
  kcal: Math.round(m.kcal),
  proteinG: Math.round(m.proteinG),
  carbsG: Math.round(m.carbsG),
  fatG: Math.round(m.fatG),
});

/**
 * Ce que pèse un repas.
 *
 * Un repas décomposé est calculé depuis ses aliments — c'est ce qui fait que
 * changer une marque de skyr met tout à jour. Un repas pas encore décomposé
 * garde les valeurs écrites du .md : glucides et lipides sont alors inconnus,
 * et valent 0 plutôt qu'un chiffre inventé.
 */
export function mealMacros(meal: Meal, overrides: FoodOverrides = {}): Macros {
  if (!meal.items) {
    return { kcal: meal.kcal, proteinG: meal.proteinG, carbsG: 0, fatG: 0 };
  }
  return arrondir(meal.items.reduce((acc, i) => somme(acc, itemMacros(i, overrides)), ZERO));
}

/**
 * Ce que les repas listés totalisent réellement.
 *
 * Ce n'est PAS la cible : c'est la somme de ce qui est écrit. Les deux ont
 * longtemps différé de 830 kcal, et c'est ce calcul qui l'a révélé. On continue
 * donc à sommer au lieu de coder un total en dur, et on affiche le résultat à
 * côté de la cible : deux nombres qui se contredisent doivent se voir.
 *
 * Un seul chemin de calcul pour tout l'écran : la carte de carburant, le total
 * du jour et le total d'un repas passent tous par ici.
 */
export function mealsTotal(
  target: NutritionTarget,
  overrides: FoodOverrides = {},
): { kcal: number; proteinG: number } {
  const t = target.meals.reduce((acc, m) => somme(acc, mealMacros(m, overrides)), ZERO);
  return { kcal: Math.round(t.kcal), proteinG: Math.round(t.proteinG) };
}

/**
 * De quel côté de la cible on est tombé.
 *
 * L'écran affichait « il manque N kcal » quoi qu'il arrive, en prenant la
 * valeur absolue de l'écart : une journée à 5 156 kcal pour une cible de 3 600
 * s'annonçait donc comme un manque de 1 556 kcal. Tant que les portions du .md
 * étaient toutes en dessous de la cible, le défaut ne se voyait pas — les
 * aliments modifiables l'ont fait sortir le jour où un excédent est devenu
 * possible.
 *
 * Le signe fait donc partie du verdict, et non de la seule mise en forme.
 */
export type GapVerdict = 'deficit' | 'surplus' | 'ok';

export function gapVerdict(
  target: NutritionTarget,
  overrides: FoodOverrides = {},
  tolerancePct = MEALS_GAP_TOLERANCE_PCT,
): GapVerdict {
  const { pct } = mealsGap(target, overrides);
  if (pct < -tolerancePct) return 'deficit';
  if (pct > tolerancePct) return 'surplus';
  return 'ok';
}

/** Écart entre les repas listés et la cible, en kcal et en pourcentage. */
export function mealsGap(
  target: NutritionTarget,
  overrides: FoodOverrides = {},
): { kcal: number; pct: number } {
  const kcal = mealsTotal(target, overrides).kcal - target.kcal;
  return { kcal, pct: Math.round((kcal / target.kcal) * 1000) / 10 };
}

// ---------------------------------------------------------------------------
// Cohérence d'une étiquette recopiée
// ---------------------------------------------------------------------------

/**
 * Les kcal que valent les macros saisies : 4 par gramme de protéines et de
 * glucides, 9 par gramme de lipides. C'est le calcul que fait tout fabricant
 * pour imprimer son étiquette.
 *
 * Ça ne tombe jamais parfaitement juste — les fibres, les polyols et les
 * arrondis de l'emballage creusent quelques pour cent d'écart. D'où une
 * tolérance large : on ne cherche pas à corriger une étiquette, seulement à
 * repérer une saisie qui ne peut pas être vraie.
 */
export function kcalFromMacros(m: { proteinG: number; carbsG: number; fatG: number }): number {
  return m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
}

/**
 * Au-delà, les kcal saisies et les macros saisies ne parlent plus du même
 * aliment. 25 % laisse passer toutes les étiquettes réelles (le plus gros écart
 * du plan est de 13 % sur la pomme, à cause des fibres) et attrape le cas
 * courant : ne changer QUE les kcal et laisser les macros de l'ancien produit.
 */
export const MACRO_COHERENCE_TOLERANCE_PCT = 25;

/**
 * Écart entre les kcal annoncées et les kcal que valent les macros, en %.
 * `null` quand les macros sont toutes à zéro : il n'y a alors rien à comparer.
 */
export function macroCoherence(m: {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): { attendues: number; ecartPct: number } | null {
  const attendues = kcalFromMacros(m);
  if (attendues <= 0) return null;
  return { attendues, ecartPct: Math.round(((m.kcal - attendues) / attendues) * 1000) / 10 };
}

/**
 * Cette ligne annonce-t-elle des kcal que ses macros ne peuvent pas produire ?
 *
 * Le cas qui a motivé ce garde-fou : des légumes passés à 416 kcal/100 g avec
 * les macros d'origine, qui n'en valent que 31. Aucun aliment ne fait ça — même
 * l'huile pure, à 900 kcal, est cohérente avec ses 100 g de lipides. L'appli ne
 * juge pas l'aliment, elle signale que les deux saisies se contredisent.
 */
export function macrosLookWrong(item: FoodItem, overrides: FoodOverrides = {}): boolean {
  const c = macroCoherence(effectiveItem(item, overrides));
  return c !== null && Math.abs(c.ecartPct) > MACRO_COHERENCE_TOLERANCE_PCT;
}
