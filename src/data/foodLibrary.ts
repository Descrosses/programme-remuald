/**
 * Bibliothèque d'aliments — ce par quoi on peut remplacer une ligne du plan.
 *
 * ── Bâtie SUR les produits du plan, pas à côté ──────────────────────────────
 *
 * Les quatorze produits de `nutrition.ts` en font partie tels quels : ce sont
 * déjà des aliments avec leur composition, leur unité et leur état de
 * référence. Les recopier ici aurait créé deux vérités pour le même poulet, et
 * la première correction d'étiquette les aurait fait diverger.
 *
 * La bibliothèque n'ajoute donc que ce qui MANQUE pour remplacer : les
 * alternatives qu'on choisit à la place d'un aliment du plan.
 *
 * ── Ce qu'elle n'est pas ────────────────────────────────────────────────────
 *
 * Pas une base nutritionnelle exhaustive. Une trentaine d'aliments courants,
 * ceux qu'on trouve dans n'importe quel supermarché. Ce qui manque se saisit
 * comme aliment personnalisé, et rejoint alors la bibliothèque.
 *
 * ── Les valeurs ─────────────────────────────────────────────────────────────
 *
 * Elles sont approchées : la composition varie d'une marque et d'une cuisson à
 * l'autre. Elles servent de point de départ raisonnable, et se corrigent depuis
 * l'écran Nutrition, étiquette en main. C'est déjà le contrat des produits du
 * plan ; il ne change pas ici.
 */

import { PRODUITS, type FoodCategory, type FoodProduct, type ReferenceState } from './nutrition';

/** Un aliment de la bibliothèque : un produit, plus son identifiant. */
export interface LibraryFood extends FoodProduct {
  id: string;
  /** Vrai pour un aliment saisi dans l'appli, pas livré avec elle. */
  isCustom?: boolean;
}

/**
 * Les alternatives, rangées par famille.
 *
 * Chaque entrée dit explicitement dans quel état elle est PESÉE. Un riz cru à
 * 350 kcal et un riz cuit à 130 ne sont pas le même aliment, et les confondre
 * triple l'apport compté.
 */
const ALTERNATIVES: Record<string, FoodProduct> = {
  // ------------------------------------------------------------- PROTÉINES --
  poulet: { label: 'Poulet cuit', unit: 'g', per: 100, kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6, referenceState: 'cuit', category: 'proteine', hint: 'Blanc de poulet.' },
  saumon: { label: 'Saumon', unit: 'g', per: 100, kcal: 208, proteinG: 20, carbsG: 0, fatG: 13, referenceState: 'cuit', category: 'proteine', hint: 'Pavé.' },
  dinde: { label: 'Dinde cuite', unit: 'g', per: 100, kcal: 150, proteinG: 30, carbsG: 0, fatG: 3, referenceState: 'cuit', category: 'proteine' },
  steakHache5: { label: 'Steak haché 5 % cuit', unit: 'g', per: 100, kcal: 170, proteinG: 26, carbsG: 0, fatG: 7, referenceState: 'cuit', category: 'proteine' },
  boeuf: { label: 'Bœuf maigre cuit', unit: 'g', per: 100, kcal: 200, proteinG: 29, carbsG: 0, fatG: 9, referenceState: 'cuit', category: 'proteine' },
  poissonBlanc: { label: 'Poisson blanc cuit', unit: 'g', per: 100, kcal: 100, proteinG: 22, carbsG: 0, fatG: 1.2, referenceState: 'cuit', category: 'proteine', hint: 'Cabillaud, colin, lieu.' },
  thon: { label: 'Thon au naturel', unit: 'g', per: 100, kcal: 110, proteinG: 25, carbsG: 0, fatG: 1, referenceState: 'na', category: 'proteine', hint: 'Égoutté.' },
  jambonBlanc: { label: 'Jambon blanc', unit: 'g', per: 100, kcal: 110, proteinG: 20, carbsG: 1, fatG: 3, referenceState: 'na', category: 'proteine' },

  // -------------------------------------------------------------- FÉCULENTS --
  riz: { label: 'Riz cuit', unit: 'g', per: 100, kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3, referenceState: 'cuit', category: 'feculent' },
  pates: { label: 'Pâtes cuites', unit: 'g', per: 100, kcal: 158, proteinG: 5.8, carbsG: 31, fatG: 0.9, referenceState: 'cuit', category: 'feculent' },
  rizCru: { label: 'Riz cru', unit: 'g', per: 100, kcal: 350, proteinG: 7, carbsG: 77, fatG: 0.9, referenceState: 'cru', category: 'feculent', hint: 'Pèse-le cru AVANT cuisson, sinon prends « Riz cuit ».' },
  patesCrues: { label: 'Pâtes crues', unit: 'g', per: 100, kcal: 360, proteinG: 12.5, carbsG: 71, fatG: 1.5, referenceState: 'cru', category: 'feculent' },
  pommesDeTerre: { label: 'Pommes de terre cuites', unit: 'g', per: 100, kcal: 85, proteinG: 2, carbsG: 18, fatG: 0.1, referenceState: 'cuit', category: 'feculent' },
  pataeDouce: { label: 'Patate douce cuite', unit: 'g', per: 100, kcal: 90, proteinG: 1.6, carbsG: 20, fatG: 0.1, referenceState: 'cuit', category: 'feculent' },
  semoule: { label: 'Semoule cuite', unit: 'g', per: 100, kcal: 120, proteinG: 4, carbsG: 25, fatG: 0.2, referenceState: 'cuit', category: 'feculent' },
  quinoa: { label: 'Quinoa cuit', unit: 'g', per: 100, kcal: 120, proteinG: 4.4, carbsG: 21, fatG: 1.9, referenceState: 'cuit', category: 'feculent' },

  // ----------------------------------------------------------- LÉGUMINEUSES --
  lentilles: { label: 'Lentilles cuites', unit: 'g', per: 100, kcal: 115, proteinG: 9, carbsG: 17, fatG: 0.4, referenceState: 'cuit', category: 'legumineuse' },
  haricotsRouges: { label: 'Haricots rouges cuits', unit: 'g', per: 100, kcal: 125, proteinG: 8.5, carbsG: 20, fatG: 0.5, referenceState: 'cuit', category: 'legumineuse' },
  poisChiches: { label: 'Pois chiches cuits', unit: 'g', per: 100, kcal: 140, proteinG: 8, carbsG: 21, fatG: 2.5, referenceState: 'cuit', category: 'legumineuse' },

  // ---------------------------------------------------------------- LÉGUMES --
  brocolis: { label: 'Brocolis cuits', unit: 'g', per: 100, kcal: 35, proteinG: 2.8, carbsG: 4, fatG: 0.4, referenceState: 'cuit', category: 'legume' },
  petitsPois: { label: 'Petits pois', unit: 'g', per: 100, kcal: 81, proteinG: 5.4, carbsG: 14.5, fatG: 0.4, referenceState: 'cuit', category: 'legume', hint: 'Riches en fibres.' },
  haricotsVerts: { label: 'Haricots verts cuits', unit: 'g', per: 100, kcal: 30, proteinG: 1.8, carbsG: 4, fatG: 0.2, referenceState: 'cuit', category: 'legume' },
  carottes: { label: 'Carottes cuites', unit: 'g', per: 100, kcal: 35, proteinG: 0.8, carbsG: 7, fatG: 0.2, referenceState: 'cuit', category: 'legume' },
  courgettes: { label: 'Courgettes cuites', unit: 'g', per: 100, kcal: 20, proteinG: 1.2, carbsG: 2.5, fatG: 0.2, referenceState: 'cuit', category: 'legume' },
  epinards: { label: 'Épinards cuits', unit: 'g', per: 100, kcal: 25, proteinG: 2.9, carbsG: 1.5, fatG: 0.4, referenceState: 'cuit', category: 'legume' },
  salade: { label: 'Salade verte', unit: 'g', per: 100, kcal: 15, proteinG: 1.2, carbsG: 1.5, fatG: 0.2, referenceState: 'na', category: 'legume' },

  // ----------------------------------------------------------------- FRUITS --
  fruitsRouges: { label: 'Fruits rouges', unit: 'g', per: 100, kcal: 45, proteinG: 0.9, carbsG: 8, fatG: 0.4, referenceState: 'na', category: 'fruit', hint: 'Surgelés ou frais, mélange standard.' },
  orange: { label: 'Orange', unit: 'unité', per: 1, kcal: 70, proteinG: 1.3, carbsG: 15, fatG: 0.2, referenceState: 'na', category: 'fruit' },
  kiwi: { label: 'Kiwi', unit: 'unité', per: 1, kcal: 45, proteinG: 0.9, carbsG: 9, fatG: 0.4, referenceState: 'na', category: 'fruit' },
  raisin: { label: 'Raisin', unit: 'g', per: 100, kcal: 70, proteinG: 0.6, carbsG: 16, fatG: 0.2, referenceState: 'na', category: 'fruit' },
  ananas: { label: 'Ananas', unit: 'g', per: 100, kcal: 50, proteinG: 0.5, carbsG: 12, fatG: 0.1, referenceState: 'na', category: 'fruit' },

  // --------------------------------------------------------------- LAITIERS --
  fromageBlanc: { label: 'Fromage blanc 3 %', unit: 'g', per: 100, kcal: 75, proteinG: 7.5, carbsG: 4.5, fatG: 3, referenceState: 'na', category: 'laitier' },
  yaourtGrec: { label: 'Yaourt grec', unit: 'g', per: 100, kcal: 110, proteinG: 9, carbsG: 4, fatG: 6, referenceState: 'na', category: 'laitier' },

  // ------------------------------------------------------------------- GRAS --
  beurreCacahuete: { label: 'Beurre de cacahuète', unit: 'g', per: 100, kcal: 600, proteinG: 25, carbsG: 12, fatG: 50, referenceState: 'na', category: 'gras' },
  noix: { label: 'Noix', unit: 'g', per: 100, kcal: 650, proteinG: 15, carbsG: 7, fatG: 62, referenceState: 'na', category: 'gras' },
  avocat: { label: 'Avocat', unit: 'g', per: 100, kcal: 160, proteinG: 2, carbsG: 2, fatG: 15, referenceState: 'na', category: 'gras' },
};

/** Tous les aliments livrés : ceux du plan, puis les alternatives. */
export const FOOD_LIBRARY: Record<string, LibraryFood> = Object.fromEntries(
  [...Object.entries(PRODUITS), ...Object.entries(ALTERNATIVES)].map(([id, p]) => [
    id,
    { ...p, id },
  ]),
);

export const CATEGORY_LABELS: Record<FoodCategory, string> = {
  proteine: 'Protéines',
  feculent: 'Féculents',
  legumineuse: 'Légumineuses',
  legume: 'Légumes',
  fruit: 'Fruits',
  laitier: 'Laitiers',
  gras: 'Gras',
  autre: 'Autres',
};

/** « cuit », « cru », ou rien quand l'état ne veut rien dire. */
export function stateLabel(state: ReferenceState): string | null {
  return state === 'na' ? null : state;
}

/**
 * Cherche dans la bibliothèque, aliments personnalisés compris.
 *
 * Sans accent ni casse : « pates » doit trouver « Pâtes cuites », parce que
 * personne ne tape les accents d'une main en cuisine.
 */
export function searchFoods(
  query: string,
  customs: LibraryFood[] = [],
  limit = 40,
): LibraryFood[] {
  const tous = [...Object.values(FOOD_LIBRARY), ...customs];
  const q = normalise(query);
  if (q === '') return tous.slice(0, limit);
  return tous
    .map((f) => ({ f, score: score(normalise(f.label), q) }))
    .filter((x) => x.score > 0)
    /* Un libellé qui COMMENCE par la recherche passe devant : taper « pou »
       doit proposer le poulet avant le beurre de cacahuète. */
    .sort((a, b) => b.score - a.score || a.f.label.localeCompare(b.f.label))
    .slice(0, limit)
    .map((x) => x.f);
}

function score(label: string, q: string): number {
  if (label === q) return 3;
  if (label.startsWith(q)) return 2;
  return label.includes(q) ? 1 : 0;
}

function normalise(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Les aliments d'une famille, triés par libellé. */
export function foodsByCategory(
  category: FoodCategory,
  customs: LibraryFood[] = [],
): LibraryFood[] {
  return [...Object.values(FOOD_LIBRARY), ...customs]
    .filter((f) => f.category === category)
    .sort((a, b) => a.label.localeCompare(b.label));
}
