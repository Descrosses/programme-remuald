/**
 * Plan alimentaire — transcription de `programme-remuald.md (§6)`.
 *
 * Même règle que pour le programme d'entraînement : ce fichier ne contient QUE
 * des données recopiées du .md. Aucun calcul, aucune décision. Ce qui décide
 * vit dans `src/engine/nutrition.ts`.
 *
 * Deux paliers et pas plus, c'est le .md qui le pose : « Une périodisation plus
 * fine, séance par séance, ajouterait de la précision théorique que tu ne peux
 * pas tenir sans peser chaque aliment. »
 *
 * Deux écarts assumés avec les maquettes :
 *
 * 1. Lipides à 100 g et non 105 g. La maquette v2 affiche 105, l'en-tête du .md
 *    écrit 100. Le .md est la source de vérité.
 * 2. Les totaux en kcal ne tombent pas exactement sur la somme des macros
 *    (170 × 4 + 480 × 4 + 100 × 9 = 3 500, pour 3 600 annoncés). C'est recopié
 *    tel quel : un plan alimentaire pratique s'écrit en repères ronds, et le
 *    .md dit lui-même « les quantités données sont des repères, pas des lois ».
 *    Le « corriger » ici inventerait une précision que le plan ne revendique pas.
 */

/** Jour d'entraînement ou jour de repos — les deux seuls paliers du plan. */
export type DayKind = 'train' | 'rest';

/**
 * Comment se pèse un aliment. `unité` sert à ce qui ne se pèse pas en pratique
 * — une banane, une pomme, un œuf : Guillaume n'a pas de balance au chantier.
 */
export type FoodUnit = 'g' | 'ml' | 'unité';

/**
 * Une ligne d'aliment d'un repas, avec sa composition.
 *
 * Avant ça, un repas n'était qu'une phrase (« 280 g de skyr… ») et deux nombres
 * écrits à la main. Impossible d'en changer une marque de yaourt sans réécrire
 * le total à la main — et sans se tromper.
 *
 * `per` dit sur quelle base la composition est donnée : 100 pour ce qui se pèse,
 * 1 pour ce qui se compte. C'est ce que portent les étiquettes, donc c'est ce que
 * Guillaume recopie sans conversion.
 *
 * `id` est stable et ne doit jamais changer : c'est lui qui relie une valeur
 * modifiée à sa ligne. Renommer un libellé est sans conséquence, renommer un id
 * ferait silencieusement oublier une modification.
 */
export interface FoodItem {
  id: string;
  /** Le produit dont cette ligne sert une quantité. Porte la composition. */
  product: string;
  label: string;
  /** Quantité consommée, dans `unit`. */
  qty: number;
  unit: FoodUnit;
  /** Base de la composition : 100 (g/ml) ou 1 (unité). */
  per: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Précision pratique affichée à la saisie. */
  hint?: string;
}

export interface Meal {
  /** « Réveil », « Déjeuner »… */
  name: string;
  /** Le détail tel qu'il est écrit dans le .md. */
  detail: string;
  kcal: number;
  proteinG: number;
  /**
   * Les aliments de ce repas, quand il a été décomposé.
   *
   * Absent = repas encore décrit par sa seule phrase, `kcal` et `proteinG` font
   * foi. Présent = les aliments font foi, et `kcal`/`proteinG` doivent valoir
   * leur somme (un test le vérifie) : deux nombres qui se contredisent, on en a
   * déjà fait les frais avec l'écart de 830 kcal.
   */
  items?: FoodItem[];
}

export interface NutritionTarget {
  kind: DayKind;
  label: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  meals: Meal[];
  /** Ce qui distingue ce palier de l'autre, en une phrase. */
  note: string;
}

// ---------------------------------------------------------------------------
// Produits — la composition, partagée par toutes les lignes qui les utilisent
//
// Le pain complet apparaît dans quatre lignes du plan : réveil et collation de
// 16 h, sur les deux paliers. Si chacune portait sa propre composition, changer
// de marque de pain demanderait de la retaper quatre fois — et trois oublis sur
// quatre. La composition vit donc UNE fois, ici, et les lignes n'y ajoutent
// qu'une quantité.
//
// C'est aussi ce que ça veut dire à l'écran : corriger le pain corrige tout le
// pain du plan ; changer une quantité ne touche que la ligne ouverte.
// ---------------------------------------------------------------------------

interface FoodProduct {
  label: string;
  unit: FoodUnit;
  /** 100 pour ce qui se pèse, 1 pour ce qui se compte. */
  per: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Précision pratique affichée à la saisie : « poids cuit », « la tranche »… */
  hint?: string;
}

const PRODUITS = {
  oeuf: { label: 'Œuf entier', unit: 'unité', per: 1, kcal: 71.5, proteinG: 6.3, carbsG: 0.35, fatG: 4.95, hint: 'Un œuf moyen, environ 50 g.' },
  pain: { label: 'Pain complet', unit: 'g', per: 100, kcal: 250, proteinG: 9, carbsG: 43, fatG: 3.3, hint: 'Une tranche pèse environ 35 g.' },
  miel: { label: 'Miel ou confiture', unit: 'g', per: 100, kcal: 300, proteinG: 0.3, carbsG: 82, fatG: 0 },
  banane: { label: 'Banane', unit: 'unité', per: 1, kcal: 107, proteinG: 1.3, carbsG: 27.6, fatG: 0.4, hint: 'Une banane moyenne, environ 120 g épluchée.' },
  pomme: { label: 'Pomme', unit: 'unité', per: 1, kcal: 80, proteinG: 0.5, carbsG: 21.5, fatG: 0.3, hint: 'Une pomme moyenne, environ 155 g.' },
  flocons: { label: 'Flocons d’avoine', unit: 'g', per: 100, kcal: 380, proteinG: 13, carbsG: 60, fatG: 7 },
  lait: { label: 'Lait demi-écrémé', unit: 'ml', per: 100, kcal: 46, proteinG: 3.3, carbsG: 4.8, fatG: 1.6 },
  skyr: { label: 'Skyr nature', unit: 'g', per: 100, kcal: 63, proteinG: 9.8, carbsG: 4, fatG: 0.2 },
  amandes: { label: 'Amandes', unit: 'g', per: 100, kcal: 580, proteinG: 21, carbsG: 10, fatG: 50 },
  viande: { label: 'Viande ou poisson', unit: 'g', per: 100, kcal: 170, proteinG: 27, carbsG: 0, fatG: 7, hint: 'Poulet, dinde, bœuf 5 %, poisson — pesé cuit.' },
  feculent: { label: 'Féculent', unit: 'g', per: 100, kcal: 125, proteinG: 3.5, carbsG: 26, fatG: 0.5, hint: 'Riz, pâtes, pommes de terre — pesé CUIT.' },
  legumes: { label: 'Légumes', unit: 'g', per: 100, kcal: 30, proteinG: 2, carbsG: 5, fatG: 0.3 },
  huile: { label: 'Huile d’olive ou de colza', unit: 'g', per: 100, kcal: 900, proteinG: 0, carbsG: 0, fatG: 100 },
  whey: { label: 'Whey', unit: 'g', per: 100, kcal: 400, proteinG: 80, carbsG: 8, fatG: 5 },
} as const satisfies Record<string, FoodProduct>;

export type ProductId = keyof typeof PRODUITS;

/**
 * Une ligne du plan : un produit, une quantité, et un identifiant à elle.
 *
 * `id` identifie la LIGNE (« le pain du réveil, jour d'entraînement ») et porte
 * la quantité. `product` identifie le PRODUIT et porte la composition. Les deux
 * se corrigent séparément, et c'est tout l'intérêt.
 */
function ligne(id: string, product: ProductId, qty: number): FoodItem {
  return { id, product, qty, ...PRODUITS[product] };
}

// ---------------------------------------------------------------------------
// Programme Remuald — jour d'entraînement
//
// Contraintes de chantier : poste 7 h 40 → 16 h (parfois 17 h), et RIEN à
// manger ni à boire entre 8 h 15 et 11 h 45, ni entre 13 h 15 et 15 h 45.
// Séance à 16 h 10 en semaine (10 h le dimanche).
//
// Le repas de 11 h 45 est donc le vrai repas d'avant-séance : il porte les
// féculents et un dessert sucré. La banane de 15 h 45 n'est qu'un appoint
// rapide, digéré avant d'arriver à la salle.
// ---------------------------------------------------------------------------

const REVEIL: Meal = {
  name: 'Au lever — ≈ 6 h 45',
  detail: '3 œufs entiers + 3 tranches de pain complet + 1 banane',
  kcal: 584,
  proteinG: 30,
  items: [
    ligne('t.reveil.oeuf', 'oeuf', 3),
    ligne('t.reveil.pain', 'pain', 105),
    ligne('t.reveil.banane', 'banane', 1),
  ],
};

/*
 * Identique aux deux paliers : le même objet sert aux deux, donc ses lignes
 * portent le préfixe « x ».
 */
const AVANT_COUPURE: Meal = {
  name: 'Avant 8 h 15',
  detail: '250 g de skyr + 40 g de flocons d’avoine + 1 pomme, préparés la veille dans un bocal',
  kcal: 390,
  proteinG: 30,
  items: [
    ligne('x.avant815.skyr', 'skyr', 250),
    ligne('x.avant815.flocons', 'flocons', 40),
    ligne('x.avant815.pomme', 'pomme', 1),
  ],
};

const MIDI: Meal = {
  name: 'Entre 11 h 45 et 13 h 15',
  detail:
    '180 g de protéine + 300 g de féculent (cuit) + 250 g de légumes + 10 g d’huile, puis 1 tranche de pain + 15 g de miel',
  kcal: 979,
  proteinG: 67,
  items: [
    ligne('t.midi.viande', 'viande', 180),
    ligne('t.midi.feculent', 'feculent', 300),
    ligne('t.midi.legumes', 'legumes', 250),
    ligne('t.midi.huile', 'huile', 10),
    ligne('t.midi.pain', 'pain', 35),
    ligne('t.midi.miel', 'miel', 15),
  ],
};

/* Identique aux deux paliers. */
const AUTOUR_SEANCE: Meal = {
  name: '15 h 45 → après la séance',
  detail: 'Dès 15 h 45 : 1 banane + 0,5 L d’eau. Après la séance : shaker whey 30 g',
  kcal: 227,
  proteinG: 25,
  items: [ligne('x.autour.banane', 'banane', 1), ligne('x.autour.whey', 'whey', 30)],
};

const DINER: Meal = {
  name: 'Dîner — ≈ 19 h - 19 h 30',
  detail: '120 g de protéine (ou 4 œufs) + 200 g de féculent (cuit) + 300 g de légumes + 10 g d’huile',
  kcal: 634,
  proteinG: 45,
  items: [
    ligne('t.diner.viande', 'viande', 120),
    ligne('t.diner.feculent', 'feculent', 200),
    ligne('t.diner.legumes', 'legumes', 300),
    ligne('t.diner.huile', 'huile', 10),
  ],
};

const TRAIN: NutritionTarget = {
  kind: 'train',
  label: 'Jour d’entraînement',
  kcal: 2800,
  proteinG: 195,
  carbsG: 345,
  fatG: 70,
  note: 'Le repas de midi est ton vrai repas d’avant-séance : ne le saute jamais. Dimanche (séance à 10 h) : mêmes aliments, petit-déjeuner 2 h avant.',
  meals: [REVEIL, AVANT_COUPURE, MIDI, AUTOUR_SEANCE, DINER],
};

// ---------------------------------------------------------------------------
// Jour de repos (mercredi, vendredi, samedi)
//
// Mêmes cinq prises, mêmes protéines : on retire seulement des féculents et le
// dessert sucré de midi, c'est la dépense de la séance qui disparaît.
// ---------------------------------------------------------------------------

const REVEIL_REPOS: Meal = {
  name: 'Au lever — ≈ 6 h 45',
  detail: '3 œufs entiers + 2 tranches de pain complet + 1 banane',
  kcal: 497,
  proteinG: 27,
  items: [
    ligne('r.reveil.oeuf', 'oeuf', 3),
    ligne('r.reveil.pain', 'pain', 70),
    ligne('r.reveil.banane', 'banane', 1),
  ],
};

const MIDI_REPOS: Meal = {
  name: 'Entre 11 h 45 et 13 h 15',
  detail: '180 g de protéine + 200 g de féculent (cuit) + 250 g de légumes + 10 g d’huile',
  kcal: 721,
  proteinG: 61,
  items: [
    ligne('r.midi.viande', 'viande', 180),
    ligne('r.midi.feculent', 'feculent', 200),
    ligne('r.midi.legumes', 'legumes', 250),
    ligne('r.midi.huile', 'huile', 10),
  ],
};

const DINER_REPOS: Meal = {
  name: 'Dîner — ≈ 19 h - 19 h 30',
  detail: '120 g de protéine (ou 4 œufs) + 100 g de féculent (cuit) + 300 g de légumes + 10 g d’huile',
  kcal: 509,
  proteinG: 42,
  items: [
    ligne('r.diner.viande', 'viande', 120),
    ligne('r.diner.feculent', 'feculent', 100),
    ligne('r.diner.legumes', 'legumes', 300),
    ligne('r.diner.huile', 'huile', 10),
  ],
};

const REST: NutritionTarget = {
  kind: 'rest',
  label: 'Jour de repos',
  kcal: 2350,
  proteinG: 185,
  carbsG: 250,
  fatG: 67,
  note: 'Mêmes cinq prises, mêmes protéines : seuls les féculents baissent. Ce n’est pas un jour de privation.',
  meals: [REVEIL_REPOS, AVANT_COUPURE, MIDI_REPOS, AUTOUR_SEANCE, DINER_REPOS],
};

export const NUTRITION_TARGETS: Record<DayKind, NutritionTarget> = {
  train: TRAIN,
  rest: REST,
};

/**
 * Toutes les lignes du plan qui servent un produit donné, paliers confondus.
 *
 * Sert à dire à Guillaume, avant qu'il saisisse, combien d'autres lignes sa
 * correction de composition va toucher. On dédoublonne par identifiant de
 * ligne : la collation de 10 h est le même objet dans les deux paliers, elle ne
 * doit pas compter double.
 */
export function linesForProduct(product: string): FoodItem[] {
  const parId = new Map<string, FoodItem>();
  for (const t of Object.values(NUTRITION_TARGETS)) {
    for (const m of t.meals) {
      for (const i of m.items ?? []) {
        if (i.product === product) parId.set(i.id, i);
      }
    }
  }
  return [...parId.values()];
}

/** Au-delà, l'écart n'est plus un arrondi et doit être signalé. */
export const MEALS_GAP_TOLERANCE_PCT = 5;

// ---------------------------------------------------------------------------
// §« Liste de courses hebdomadaire type »
// ---------------------------------------------------------------------------

export interface ShoppingGroup {
  title: string;
  items: string;
}

export const SHOPPING_LIST: ShoppingGroup[] = [
  {
    title: 'Protéines',
    items: 'Œufs, poulet ou dinde, bœuf haché 5 %, poisson, skyr, whey',
  },
  {
    title: 'Glucides',
    items: 'Riz, pâtes complètes, pain complet, flocons d’avoine, pommes de terre, bananes, pommes, miel',
  },
  { title: 'Lipides', items: 'Huile d’olive ou de colza' },
  {
    title: 'Légumes',
    items: 'En grande quantité, ce qui te plaît — haricots verts, brocolis, carottes, salade, courgettes',
  },
]

// ---------------------------------------------------------------------------
// §« Principe général » et §« Suivi et ajustement », réduits aux règles qu'on
// relit en faisant ses courses.
// ---------------------------------------------------------------------------

export const SIMPLE_RULES: string[] = [
  'Une protéine à chaque repas, sans exception.',
  'Le repas de 11 h 45 se prépare la veille : c’est ton carburant pour la séance.',
  'Légumes à volonté, ça ne compte quasiment pas.',
  'Moyenne 7 jours, jamais une pesée isolée.',
  'Aucun aliment interdit : une quiche ou un repas libre de temps en temps fait partie du plan.',
]

/** §« Le seul complément qui vaut le coup ». */
export const SUPPLEMENTS_NOTE =
  'La whey est un dépannage pratique après la séance. Créatine 5 g/jour : facultative. Pas de brûleur de graisse.';

/** §« Hydratation ». */
export const HYDRATION_NOTE =
  'Rien à boire entre 8 h 15 et 11 h 45 ni entre 13 h 15 et 15 h 45 : bois 0,5 L avant 8 h 15, 0,5 L dès 11 h 45, 0,5 L avant 13 h 15, 0,5 L dès 15 h 45, le reste le soir. Par forte chaleur : +0,5 à 1 L et une pincée de sel à 11 h 45. Maux de tête ou vertiges sur l’échafaudage → tu le signales.';

/** §« Suivi et ajustement » — la vitesse de prise visée. */
export const TARGET_GAIN_KG_PER_WEEK = { min: -1, max: -0.5 } as const;
// ↑ Programme Remuald : perte de 0,5 à 1 kg par semaine (≈ 0,5 à 1 % du poids).

// ---------------------------------------------------------------------------
// Bonus glucidique par séance — décision de Guillaume, hors .md
// ---------------------------------------------------------------------------

/**
 * Carburant supplémentaire les jours où la séance coûte cher en glycogène.
 *
 * Ce n'est PAS un second plan alimentaire. Le plan de base ne bouge pas d'un
 * gramme, les protéines et les lipides ne varient jamais selon la séance :
 * seul un bonus de glucides s'ajoute, affiché à part, et Guillaume le prend ou
 * non selon sa faim, sa fatigue et l'évolution de son poids.
 *
 * Rien n'est fondu dans les totaux du plan de base — un bonus invisible
 * deviendrait une obligation silencieuse, ce qui est l'inverse du but.
 */
export type FuelLevel = 'high' | 'medium' | 'standard' | 'rest';

export interface FuelAdvice {
  level: FuelLevel;
  emoji: string;
  title: string;
  /** Ce que coûte la séance, en une ligne. */
  subtitle: string;
  /** Aliments à ajouter. Vide pour « standard » et « repos ». */
  foods: string[];
  /** Pour le calcul du total avec bonus. 0 quand il n'y a pas de bonus. */
  kcal: number;
  /** Fourchette telle que Guillaume l'a écrite, pour l'affichage. */
  kcalLabel: string;
  carbsLabel: string;
  message: string;
}

export const FUEL_ADVICE: Record<FuelLevel, FuelAdvice> = {
  high: {
    level: 'high',
    emoji: '🔴',
    title: 'CARBURANT ++',
    subtitle: 'Séance très exigeante',
    foods: ['+ 1 banane', '+ 40 g pain', '+ 20 g miel'],
    kcal: 240,
    kcalLabel: '≈ +240 kcal',
    carbsLabel: '≈ +55-60 g glucides',
    message: 'À répartir dans la journée, avec priorité avant l’entraînement.',
  },
  medium: {
    level: 'medium',
    emoji: '🟠',
    title: 'CARBURANT +',
    subtitle: 'Séance exigeante',
    foods: ['+ 1 banane', '+ 20 g miel'],
    kcal: 145,
    kcalLabel: '≈ +145 kcal',
    carbsLabel: '≈ +35-40 g glucides',
    message: 'À consommer de préférence avant l’entraînement.',
  },
  standard: {
    level: 'standard',
    emoji: '🟡',
    title: 'STANDARD',
    subtitle: 'Séance modérée',
    foods: [],
    kcal: 0,
    kcalLabel: '',
    carbsLabel: '',
    message: 'Plan alimentaire de base — aucun ajout nécessaire.',
  },
  rest: {
    level: 'rest',
    emoji: '🟢',
    title: 'REPOS',
    subtitle: 'Pas de séance aujourd’hui',
    foods: [],
    kcal: 0,
    kcalLabel: '',
    carbsLabel: '',
    message: 'Jour de récupération — plan alimentaire de base.',
  },
};

/**
 * Niveau de carburant par jour d'entraînement du programme (§3).
 *
 * La clé est le `DayIndex` de la séance réellement programmée, pas un nom de
 * jour écrit à part : chaque jour du programme porte une et une seule trame
 * (`BASE_SESSIONS`), donc ce numéro EST l'identité du type de séance. Si le
 * calendrier évolue, la carte suit sans retouche.
 *
 *   0 lundi     Lower Strength — squat lourd, RDL, unilatéral, sauts
 *   2 mercredi  Upper Strength — bench et tractions lestées
 *   4 vendredi  Total Body Power — vitesse, sauts, speed squat
 *   5 samedi    Posterior Chain — deadlift, front squat, hip thrust, sauts
 *   6 dimanche  Upper Athletic + tronc
 *
 * Le mercredi est la séance la plus lourde en charge de la semaine, et pourtant
 * « standard » : un travail de force du haut du corps puise beaucoup moins dans
 * le glycogène qu'une séance jambes ou sauts. C'est un choix de Guillaume, pas
 * un oubli.
 *
 * Mardi et jeudi sont absents : sans séance, le niveau est « repos ».
 */
export const FUEL_BY_TRAINING_DAY: Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, FuelLevel>> = {
  // Programme Remuald : objectif perte de graisse, pas de bonus glucidique.
  0: 'standard',
  1: 'standard',
  3: 'standard',
  6: 'standard',
}
