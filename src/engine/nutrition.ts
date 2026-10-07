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
  DELOAD_QUANTITIES,
  FUEL_ADVICE,
  FUEL_BY_TRAINING_DAY,
  MEALS_GAP_TOLERANCE_PCT,
  TARGET_GAIN_KG_PER_WEEK,
  type FoodItem,
  type FuelAdvice,
  type Meal,
  type NutritionPhase,
  type NutritionTarget,
} from '../data/nutrition';
import { FOOD_LIBRARY } from '../data/foodLibrary';
import { WEEK_BLOCKS } from '../data/program';
import { isCombineDay } from '../data/testSessions';
import type { DayIndex, WeekIndex } from '../data/types';

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

// ---------------------------------------------------------------------------
// Phase du programme — ce que la périodisation change dans l'assiette
// ---------------------------------------------------------------------------

/**
 * La phase nutritionnelle d'une journée donnée.
 *
 * ── Elle se lit de la périodisation, elle ne la recopie pas ────────────────
 *
 * La phase vient de `WEEK_BLOCKS` et du calendrier des combines. Écrire
 * « semaines 4 et 8 » en dur créerait une deuxième vérité sur le programme :
 * le jour où la périodisation bouge, l'alimentation suivrait encore l'ancienne.
 *
 * C'est aussi ce qui règle la semaine 12 toute seule, sans cas particulier :
 * son bloc est `taper`, pas `deload`. Le volume y baisse, mais les tests de
 * performance demandent une disponibilité énergétique entière, et la règle le
 * donne sans qu'on ait à l'écrire.
 *
 * ── Les deux cas ───────────────────────────────────────────────────────────
 *
 *   semaine de deload,     → `normal`. Le samedi et le dimanche de la semaine 8
 *   jour de combine          portent des tests : une journée où l'on cherche
 *                            une performance se mange comme une journée
 *                            d'entraînement normale.
 *   semaine de deload,     → `deloadLight`, sur les DEUX paliers. Le jour de
 *   tout autre jour          repos baisse deux fois moins que le jour
 *                            d'entraînement : il part déjà plus bas,       
 *                            et y empiler une grosse coupe ferait d'une semaine
 *                            de récupération la plus restrictive du programme.
 *
 * `day` vaut `null` les jours sans séance. Ils restent concernés — on est bien
 * dans la semaine de deload — et c'est le palier repos, avec ses propres
 * quantités allégées, qui s'applique alors.
 */
export function phaseForDay(week: WeekIndex | null, day: DayIndex | null): NutritionPhase {
  if (week === null) return 'normal';
  if (WEEK_BLOCKS[week] !== 'deload') return 'normal';
  if (day !== null && isCombineDay(week, day)) return 'normal';
  return 'deloadLight';
}

/**
 * Le palier tel que la phase le modifie — mêmes aliments, quelques quantités.
 *
 * ── Pourquoi un palier dérivé plutôt qu'un paramètre de plus ───────────────
 *
 * Tout le calcul existant part des lignes d'un repas : `itemMacros`,
 * `mealMacros`, `mealsTotal`, l'écart à la cible, le remplacement d'un aliment,
 * les corrections d'étiquette. Ajouter la phase à chacun aurait demandé de la
 * faire traverser six fonctions sans rien y gagner.
 *
 * On produit donc un palier normal, dont seules des quantités diffèrent, et
 * tout le reste continue de fonctionner sans le savoir. Les totaux se
 * recalculent par le même chemin qu'avant.
 *
 * Hors deload, c'est l'objet d'origine qui est rendu, à l'identique : la
 * fonction est alors strictement inerte.
 *
 * ── Les corrections saisies passent par-dessus ────────────────────────
 *
 * Elles s'appliquent plus tard, dans `effectiveItem`, et par identifiant de
 * ligne. Une quantité saisie à la main gagne donc toujours sur
 * l'ajustement automatique — ce qui est le bon ordre : l'appli propose, l'utilisateur
 * tranche.
 */
export function targetForPhase(
  target: NutritionTarget,
  phase: NutritionPhase,
  quantites: Readonly<Record<string, number>> = DELOAD_QUANTITIES,
): NutritionTarget {
  if (phase === 'normal') return target;
  // Aucune ligne de ce palier n'est allégée : le palier reste l'objet d'origine.
  if (!target.meals.some((m) => (m.items ?? []).some((i) => i.id in quantites))) return target;

  const meals = target.meals.map((m) => repasAjuste(m, phase, quantites));
  /*
   * Les quatre macros de la cible sont RECALCULÉES, pas recopiées.
   *
   * Sans ça, l'écran comparerait des repas allégés à la cible d'une journée
   * normale et annoncerait un déficit de 200 kcal à chaque jour de deload —
   * une alerte sur un plan qui fait exactement ce qu'on lui demande.
   */
  const total = somme4(meals.map((m) => mealMacros(m)));
  return {
    ...target,
    meals,
    kcal: Math.round(total.kcal),
    proteinG: Math.round(total.proteinG),
    carbsG: Math.round(total.carbsG),
    fatG: Math.round(total.fatG),
  };
}

/** Un repas dont les lignes concernées portent leur quantité de deload. */
function repasAjuste(
  meal: Meal,
  phase: NutritionPhase,
  quantites: Readonly<Record<string, number>>,
): Meal {
  if (!meal.items?.some((i) => quantites[i.id] !== undefined)) return meal;

  const items = meal.items.map((i) => {
    const qty = quantites[i.id];
    return qty === undefined || qty === i.qty ? i : { ...i, qty, adjusted: phase };
  });
  const m = mealMacros({ ...meal, items });
  return { ...meal, items, kcal: m.kcal, proteinG: m.proteinG };
}

function somme4(macros: Macros[]): Macros {
  return macros.reduce((a, b) => somme(a, b), ZERO);
}

// ---------------------------------------------------------------------------
// Ce qui a réellement été mangé
// ---------------------------------------------------------------------------

/**
 * Le total des repas cochés comme pris.
 *
 * ── Pourquoi rien de plus n'est saisi ───────────────────────────────────────
 *
 * Les corrections de Guillaume SONT déjà ce qu'il a mangé : s'il a remplacé le
 * poulet par du saumon et pesé 400 g de riz au lieu de 320, le plan effectif
 * dit exactement son assiette. Lui redemander aliment par aliment ce qu'il
 * vient de corriger serait lui faire saisir deux fois la même chose — et sur un
 * chantier, la deuxième saisie n'arrive jamais.
 *
 * Cocher un repas dit donc « celui-là, je l'ai pris », et ses macros effectives
 * entrent dans la journée. Rien n'est figé au moment de la coche : corriger une
 * étiquette après coup corrige aussi ce qui a été compté, ce qui est le bon
 * sens — l'étiquette n'a pas changé entre-temps, c'est la connaissance qu'on en
 * avait.
 */
export function consumedTotal(
  target: NutritionTarget,
  eaten: ReadonlySet<string>,
  overrides: FoodOverrides = {},
  library: Catalogue = FOOD_LIBRARY,
): Macros {
  return arrondir(
    target.meals
      .filter((m) => eaten.has(m.id))
      .reduce((acc, m) => somme(acc, mealMacros(m, overrides, library)), ZERO),
  );
}

/** Ce qu'il reste à manger pour atteindre le plan. Négatif = dépassé. */
export function remainingTotal(planned: Macros, consumed: Macros): Macros {
  return {
    kcal: planned.kcal - consumed.kcal,
    proteinG: planned.proteinG - consumed.proteinG,
    carbsG: planned.carbsG - consumed.carbsG,
    fatG: planned.fatG - consumed.fatG,
  };
}

/**
 * Où en est la journée sur une macro : la part consommée du prévu.
 *
 * Bornée à 200 % et non à 100 : un dépassement doit se VOIR, pas se faire
 * ravaler à « plein ». Au-delà du double, la barre ne dit plus rien d'utile et
 * le chiffre écrit à côté prend le relais.
 */
export function progressPct(consumed: number, planned: number): number {
  if (!Number.isFinite(consumed) || !Number.isFinite(planned) || planned <= 0) return 0;
  return Math.min(200, Math.round((Math.max(0, consumed) / planned) * 100));
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
  /**
   * Remplacement : l'identifiant de l'aliment réellement mangé à la place de
   * celui du plan.
   *
   * Rangé sous la clé de la LIGNE, jamais sous celle du produit. Remplacer le
   * féculent du midi par du riz ne doit pas changer celui du dîner — sinon on
   * ne pourrait plus manger du riz à midi et des pâtes le soir, qui est
   * exactement ce qu'on cherche à permettre.
   *
   * Le plan du .md n'est jamais réécrit : il reste ce qui était prévu, et cette
   * ligne dit ce qui a été mangé. C'est aussi ce qui rend le retour en arrière
   * possible.
   */
  productId?: string;
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
export function effectiveItem(
  item: FoodItem,
  overrides: FoodOverrides = {},
  library: Catalogue = FOOD_LIBRARY,
): FoodItem {
  const surLigne = overrides[item.id];

  /*
   * Le remplacement se résout EN PREMIER : tout ce qui suit parle de l'aliment
   * réellement mangé, pas de celui du plan. Sa composition se corrige donc sous
   * SA clé à lui — recopier l'étiquette du saumon ne doit pas atterrir sous
   * « Viande ou poisson ».
   */
  const remplacant = surLigne?.productId ? library[surLigne.productId] : undefined;
  const base: FoodItem = remplacant
    ? {
        ...item,
        product: surLigne!.productId!,
        label: remplacant.label,
        unit: remplacant.unit,
        per: remplacant.per,
        kcal: remplacant.kcal,
        proteinG: remplacant.proteinG,
        carbsG: remplacant.carbsG,
        fatG: remplacant.fatG,
        /*
         * L'état et la famille viennent du remplaçant, eux aussi.
         *
         * Ils étaient oubliés : remplacer « Riz cuit » par « Riz cru » laissait
         * la ligne afficher « cuit » alors qu'on y avait mis du cru — c'est-à-
         * dire la seule chose que cet état existe pour éviter. Et rouvrir la
         * feuille de remplacement après un poulet devenu banane proposait des
         * protéines, puisque la famille était restée celle du plan.
         */
        referenceState: remplacant.referenceState,
        category: remplacant.category,
        ...(remplacant.hint !== undefined ? { hint: remplacant.hint } : {}),
        qty: quantiteApresRemplacement(item, remplacant),
      }
    : item;

  const surProduit = overrides[base.product];
  if (!surLigne && !surProduit) return base;
  return {
    ...base,
    qty: surLigne?.qty ?? base.qty,
    kcal: surProduit?.kcal ?? base.kcal,
    proteinG: surProduit?.proteinG ?? base.proteinG,
    carbsG: surProduit?.carbsG ?? base.carbsG,
    fatG: surProduit?.fatG ?? base.fatG,
  };
}

/** Un catalogue d'aliments consultable par identifiant. */
export type Catalogue = Record<string, FoodLike>;

/** Ce dont le remplacement a besoin : une composition, une unité, un état. */
export interface FoodLike {
  label: string;
  unit: FoodItem['unit'];
  per: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Pesé cru ou cuit — affiché sur la ligne, et au moment du choix. */
  referenceState: FoodItem['referenceState'];
  /** Famille, qui décide de la liste ouverte au remplacement suivant. */
  category: FoodItem['category'];
  hint?: string;
}

/**
 * La quantité à proposer après un remplacement.
 *
 * On garde la quantité de la portion remplacée — 180 g de viande deviennent
 * 180 g de saumon — SAUF si l'unité change. Remplacer 180 g de viande par une
 * banane donnerait sinon 180 bananes : l'unité passe de « g » à « unité », et
 * le nombre ne veut plus rien dire.
 *
 * Dans ce cas on repart d'une valeur plausible — 1 pour ce qui se compte,
 * 100 pour ce qui se pèse — à ajuster ensuite.
 */
export function quantiteApresRemplacement(ancien: FoodItem, nouveau: FoodLike): number {
  if (ancien.unit === nouveau.unit) return ancien.qty;
  return nouveau.unit === 'unité' ? 1 : 100;
}

/** Les deux clés sous lesquelles se range une correction de cette ligne. */
export const CLE_QUANTITE = (item: FoodItem): string => item.id;
export const CLE_COMPOSITION = (item: FoodItem): string => item.product;

/** Cet aliment est-il modifié par rapport au .md ? */
export function isEdited(
  item: FoodItem,
  overrides: FoodOverrides = {},
  library: Catalogue = FOOD_LIBRARY,
): boolean {
  const e = effectiveItem(item, overrides, library);
  return (
    e.product !== item.product || // remplacé par un autre aliment
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
export function itemMacros(
  item: FoodItem,
  overrides: FoodOverrides = {},
  library: Catalogue = FOOD_LIBRARY,
): Macros {
  const e = effectiveItem(item, overrides, library);
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
export function mealMacros(
  meal: Meal,
  overrides: FoodOverrides = {},
  library: Catalogue = FOOD_LIBRARY,
): Macros {
  if (!meal.items) {
    return { kcal: meal.kcal, proteinG: meal.proteinG, carbsG: 0, fatG: 0 };
  }
  return arrondir(
    meal.items.reduce((acc, i) => somme(acc, itemMacros(i, overrides, library)), ZERO),
  );
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
  library: Catalogue = FOOD_LIBRARY,
): Macros {
  /*
   * On somme les repas DÉJÀ arrondis, et non les aliments bruts : c'est ce
   * qu'on lit à l'écran, repas par repas. Sommer les valeurs brutes donnerait
   * un total juste au centième mais différent de l'addition des lignes
   * affichées — et c'est l'addition visible qui doit tomber juste.
   *
   * Les quatre macros sont cumulées, pas seulement les kcal et les protéines :
   * les glucides et les lipides n'étaient calculés qu'au niveau du repas, donc
   * la journée ne pouvait pas les afficher autrement qu'en les écrivant à part.
   */
  return arrondir(
    target.meals.reduce((acc, m) => somme(acc, mealMacros(m, overrides, library)), ZERO),
  );
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
  library: Catalogue = FOOD_LIBRARY,
): GapVerdict {
  const { pct } = mealsGap(target, overrides, library);
  if (pct < -tolerancePct) return 'deficit';
  if (pct > tolerancePct) return 'surplus';
  return 'ok';
}

/** Écart entre les repas listés et la cible, en kcal et en pourcentage. */
export function mealsGap(
  target: NutritionTarget,
  overrides: FoodOverrides = {},
  library: Catalogue = FOOD_LIBRARY,
): { kcal: number; pct: number } {
  const kcal = mealsTotal(target, overrides, library).kcal - target.kcal;
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
