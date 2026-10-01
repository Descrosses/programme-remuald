/**
 * La règle centrale du plan alimentaire : « on ne regarde jamais une pesée
 * isolée ». Ces tests vérifient d'abord ça, puis les seuils d'ajustement.
 */

import { describe, expect, it } from 'vitest';
import {
  ADJUST_RULES,
  effectiveItem,
  fuelForToday,
  gapVerdict,
  isEdited,
  itemMacros,
  kcalFromMacros,
  macroCoherence,
  macrosLookWrong,
  mealMacros,
  mealsGap,
  mealsTotal,
  starchToCloseGap,
  type FoodOverrides,
  latestWaist,
  nutritionAdvice,
  weeklyAverages,
  weightTrend,
  windowAverage,
  type Measurement,
} from './nutrition';
import { FUEL_ADVICE, NUTRITION_TARGETS, type Meal } from '../data/nutrition';
import { lireDecimal } from '../components/MealItems';
import type { DayIndex } from '../data/types';

const AUJOURDHUI = '2026-03-01';

/** Fabrique une pesée par jour, en remontant depuis `AUJOURDHUI`. */
function serie(poids: Array<number | null>, waist: Record<number, number> = {}): Measurement[] {
  return poids.map((kg, i) => ({
    date: new Date(Date.parse(`${AUJOURDHUI}T12:00:00Z`) - i * 86_400_000)
      .toISOString()
      .slice(0, 10),
    weightKg: kg,
    waistCm: waist[i] ?? null,
  }));
}

/** Une pesée hebdomadaire unique, `weeks` semaines de suite, à partir de `kg`. */
function hebdo(kg: number[], waistParSemaine: Record<number, number> = {}): Measurement[] {
  return kg.map((w, i) => ({
    date: new Date(Date.parse(`${AUJOURDHUI}T12:00:00Z`) - i * 7 * 86_400_000)
      .toISOString()
      .slice(0, 10),
    weightKg: w,
    waistCm: waistParSemaine[i] ?? null,
  }));
}

describe('moyenne glissante', () => {
  it('moyenne les 7 derniers jours, pas davantage', () => {
    // 7 jours à 80 kg, puis 7 jours à 70 kg : la fenêtre ne doit voir que 80.
    const e = serie([80, 80, 80, 80, 80, 80, 80, 70, 70, 70, 70, 70, 70, 70]);
    expect(windowAverage(e, AUJOURDHUI, 7)).toBe(80);
  });

  it('une seule pesée dans la semaine suffit — le .md prévoit ce cas', () => {
    const e = serie([79.4, null, null, null, null, null, null]);
    expect(windowAverage(e, AUJOURDHUI, 7)).toBe(79.4);
  });

  it('rend null quand la fenêtre est vide, au lieu d’inventer un 0', () => {
    expect(windowAverage([], AUJOURDHUI, 7)).toBeNull();
    expect(windowAverage(serie([null, null]), AUJOURDHUI, 7)).toBeNull();
  });

  it('compare la semaine à la précédente', () => {
    const e = serie([80, 80, 80, 80, 80, 80, 80, 79, 79, 79, 79, 79, 79, 79]);
    const t = weightTrend(e, AUJOURDHUI);
    expect(t.average7).toBe(80);
    expect(t.previous7).toBe(79);
    expect(t.deltaKg).toBe(1);
    expect(t.countThisWeek).toBe(7);
  });

  it('programme Remuald : signale une perte dans la fourchette visée, −0,5 à −1 kg', () => {
    const e = serie([109.3, 109.3, 109.3, 109.3, 109.3, 109.3, 109.3, 110, 110, 110, 110, 110, 110, 110]);
    expect(weightTrend(e, AUJOURDHUI).onTarget).toBe(true);
    const tropVite = serie([108.5, 108.5, 108.5, 108.5, 108.5, 108.5, 108.5, 110, 110, 110, 110, 110, 110, 110]);
    expect(weightTrend(tropVite, AUJOURDHUI).onTarget).toBe(false);
    const stable = serie([109.9, 109.9, 109.9, 109.9, 109.9, 109.9, 109.9, 110, 110, 110, 110, 110, 110, 110]);
    expect(weightTrend(stable, AUJOURDHUI).onTarget).toBe(false);
  });

  it('découpe l’historique en fenêtres hebdomadaires', () => {
    const points = weeklyAverages(hebdo([80, 79.5, 79, 78.5]), AUJOURDHUI, 4);
    expect(points.map((p) => p.average)).toEqual([80, 79.5, 79, 78.5]);
    expect(points[0]!.endDate).toBe(AUJOURDHUI);
  });
});

describe('suggestion d’ajustement', () => {
  it('ne dit rien sans historique', () => {
    expect(nutritionAdvice([], AUJOURDHUI).kind).toBe('none');
  });

  it('ne dit rien sur une seule pesée, même spectaculaire', () => {
    const e: Measurement[] = [{ date: AUJOURDHUI, weightKg: 85, waistCm: null }];
    expect(nutritionAdvice(e, AUJOURDHUI).kind).toBe('none');
  });

  it('programme Remuald (perte de poids) : poids stable 3 semaines → retire 50 g', () => {
    const e = hebdo([109.0, 109.05, 108.95, 109.0]);
    const a = nutritionAdvice(e, AUJOURDHUI);
    expect(a.kind).toBe('remove');
    expect(a.weeks).toBe(3);
    expect(a.action).toBe('Retire 50 g de féculent au dîner.');
  });

  it('deux semaines stables ne suffisent pas : la 3e tranche', () => {
    const e = hebdo([109.0, 109.05, 108.95, 110.0]);
    expect(nutritionAdvice(e, AUJOURDHUI).kind).toBe('none');
  });

  it('une perte régulière de 0,7 kg par semaine ne déclenche rien : c’est le rythme visé', () => {
    const e = hebdo([107.9, 108.6, 109.3, 110.0]);
    expect(nutritionAdvice(e, AUJOURDHUI).kind).toBe('none');
  });

  it('perte de plus de 1,1 kg/semaine sur 2 semaines → ajoute 50 g', () => {
    const e = hebdo([106.4, 107.6, 108.8, 110.0]);
    const a = nutritionAdvice(e, AUJOURDHUI);
    expect(a.kind).toBe('add');
    expect(a.weeks).toBe(2);
    expect(a.action).toContain('Ajoute 50 g');
  });

  it('une seule semaine de perte rapide ne suffit pas', () => {
    const e = hebdo([106.8, 108.0, 108.5, 109.0]);
    expect(nutritionAdvice(e, AUJOURDHUI).kind).toBe('none');
  });

  it('un trou dans l’historique fait taire la suggestion au lieu de deviner', () => {
    const e = hebdo([79.0, 79.05, 78.95]);
    // La 4e fenêtre est vide : la 3e variation est inconnue.
    expect(nutritionAdvice(e, AUJOURDHUI).kind).toBe('none');
  });

  it('les seuils codés sont bien les bords prudents du .md', () => {
    expect(ADJUST_RULES.stableKg).toBe(0.15); // et non 0,2
    expect(ADJUST_RULES.stableWeeks).toBe(3); // et non 2
    expect(ADJUST_RULES.fastLossKg).toBe(1.1); // 1 % du poids de départ
    expect(ADJUST_RULES.fastLossWeeks).toBe(2); // on corrige tôt
  });
});

describe('tour de taille', () => {
  it('retient la mesure la plus récente, pas la première venue', () => {
    const e = serie([80, 80, 80], { 0: 86, 2: 88 });
    expect(latestWaist(e)).toBe(86);
  });

  it('sait remonter à une date donnée', () => {
    const e = serie([80, 80, 80], { 0: 86, 2: 88 });
    expect(latestWaist(e, '2026-02-28')).toBe(88);
  });

  it('rend null s’il n’y en a aucune', () => {
    expect(latestWaist(serie([80, 80]))).toBeNull();
  });
});

/**
 * Bonus glucidique : le niveau suit la séance réellement programmée, jamais un
 * nom de jour tenu à part. Ces tests figent les sept jours de la semaine type.
 */
describe('carburant du jour — programme Remuald', () => {
  it('objectif perte de graisse : aucun bonus glucidique, quel que soit le jour', () => {
    for (const day of [0, 1, 3, 6] as DayIndex[]) {
      expect(fuelForToday(day).level, `jour ${day}`).toBe('standard');
      expect(fuelForToday(day).kcal, `jour ${day}`).toBe(0);
    }
  });

  it('un jour sans séance ne propose jamais de bonus', () => {
    expect(fuelForToday(null).level).toBe('rest');
    expect(fuelForToday(null).kcal).toBe(0);
  });

  it('aucun sous-titre ne nomme un contenu de séance', () => {
    const interdits = ['haut du corps', 'bas du corps', 'squat', 'traction', 'soulevé'];
    for (const niveau of Object.values(FUEL_ADVICE)) {
      for (const mot of interdits) {
        expect(niveau.subtitle.toLowerCase().includes(mot), `${niveau.level} — ${mot}`).toBe(false);
      }
    }
  });
});

describe('féculent nécessaire pour combler l’écart', () => {
  it('convertit l’écart au taux du plan, arrondi à 50 g', () => {
    expect(starchToCloseGap(-700)).toBe(700);
    expect(starchToCloseGap(-830)).toBe(850);
    expect(starchToCloseGap(-20)).toBe(0);
  });

  it('ne dépend pas du signe : c’est un manque, pas une soustraction', () => {
    expect(starchToCloseGap(700)).toBe(starchToCloseGap(-700));
  });
});

describe('aliments modifiables', () => {
  const COLLATION = NUTRITION_TARGETS.train.meals.find((m) => m.name === 'Avant 8 h 15')!;
  const skyr = COLLATION.items!.find((i) => i.product === 'skyr')!;
  const pomme = COLLATION.items!.find((i) => i.product === 'pomme')!;

  it('un aliment pesé compte au prorata de sa quantité', () => {
    // 250 g de skyr à 63 kcal/100 g.
    expect(itemMacros(skyr).kcal).toBeCloseTo(157.5, 1);
    expect(itemMacros(skyr).proteinG).toBeCloseTo(24.5, 2);
  });

  it('un aliment compté à l’unité ne divise pas par 100', () => {
    expect(pomme.per).toBe(1);
    expect(itemMacros(pomme).kcal).toBe(80);
  });

  /*
   * Le point de tout le mécanisme : changer la marque de skyr ne demande que
   * de recopier l'étiquette. Le repas, puis la journée, suivent.
   */
  it('changer la composition d’un aliment change le total du repas et du jour', () => {
    const avantRepas = mealMacros(COLLATION).kcal;
    const avantJour = mealsTotal(NUTRITION_TARGETS.train).kcal;

    // Un skyr plus riche : 86 kcal/100 g au lieu de 63.
    const ov: FoodOverrides = { [skyr.product]: { kcal: 86 } };
    const apresRepas = mealMacros(COLLATION, ov).kcal;
    const apresJour = mealsTotal(NUTRITION_TARGETS.train, ov).kcal;

    // 250 g × (86 − 63) / 100 = 57,5 kcal. Le repas est arrondi une seule
    // fois, à la fin : 389,5 → 390 avant, 447 après, soit 57.
    expect(apresRepas - avantRepas).toBe(57);
    expect(apresJour - avantJour).toBe(apresRepas - avantRepas);
  });

  it('changer la seule quantité ne fige pas la composition', () => {
    const ov: FoodOverrides = { [skyr.id]: { qty: 400 } };
    expect(effectiveItem(skyr, ov).kcal).toBe(skyr.kcal);
    expect(itemMacros(skyr, ov).kcal).toBeCloseTo(252, 1);
  });

  it('un aliment sans valeur modifiée reste exactement celui du .md', () => {
    expect(effectiveItem(skyr, {})).toBe(skyr);
    expect(effectiveItem(skyr, { amandes: { kcal: 1 } })).toBe(skyr);
    expect(isEdited(skyr, {})).toBe(false);
    expect(isEdited(skyr, { [skyr.id]: { qty: 250 } })).toBe(false); // même valeur = pas modifié
    expect(isEdited(skyr, { [skyr.id]: { qty: 300 } })).toBe(true);
  });

  it('un repas pas encore décomposé garderait les valeurs écrites du .md', () => {
    // Tous les repas sont décomposés aujourd'hui. Ce test protège le repli :
    // ajouter un repas sans ses aliments ne doit pas le compter pour zéro.
    const brut: Meal = { name: 'Test', detail: '', kcal: 500, proteinG: 40 };
    expect(brut.items).toBeUndefined();
    expect(mealMacros(brut)).toEqual({
      kcal: 500,
      proteinG: 40,
      carbsG: 0, // inconnus tant que le repas n'est pas décomposé — pas inventés
      fatG: 0,
    });
  });

  it('une correction de composition vaut pour toutes les lignes du même produit', () => {
    // Le pain apparaît au lever (deux paliers) et au repas de midi : une seule
    // saisie doit suffire.
    const lignesPain = Object.values(NUTRITION_TARGETS)
      .flatMap((t) => t.meals)
      .flatMap((m) => m.items ?? [])
      .filter((i) => i.product === 'pain');
    expect(lignesPain.length).toBeGreaterThanOrEqual(3);
    for (const l of lignesPain) {
      expect(effectiveItem(l, { pain: { kcal: 300 } }).kcal, l.id).toBe(300);
    }
  });

  it('une correction de quantité ne touche QUE la ligne ouverte', () => {
    const reveil = NUTRITION_TARGETS.train.meals.find((m) => m.name === 'Au lever — ≈ 6 h 45')!;
    const painReveil = reveil.items!.find((i) => i.product === 'pain')!;
    const autres = Object.values(NUTRITION_TARGETS)
      .flatMap((t) => t.meals)
      .flatMap((m) => m.items ?? [])
      .filter((i) => i.product === 'pain' && i.id !== painReveil.id);
    const ov: FoodOverrides = { [painReveil.id]: { qty: 140 } };
    expect(effectiveItem(painReveil, ov).qty).toBe(140);
    for (const a of autres) expect(effectiveItem(a, ov).qty, a.id).toBe(a.qty);
  });

  it('lit une saisie au clavier français, virgule comprise', () => {
    expect(lireDecimal('9,8')).toBe(9.8);
    expect(lireDecimal('9.8')).toBe(9.8);
    expect(lireDecimal(' 280 ')).toBe(280);
    // Vide ou illisible = « ne touche à rien », jamais 0 : une faute de frappe
    // ne doit pas faire disparaître un aliment du total.
    expect(lireDecimal('')).toBeNull();
    expect(lireDecimal('abc')).toBeNull();
    expect(lireDecimal('-5')).toBeNull();
  });
});

describe('sens de l’écart entre les repas et la cible', () => {
  /*
   * Le bug que ce bloc verrouille : l'écran annonçait « il manque N kcal »
   * quel que soit le sens, parce qu'il prenait la valeur absolue de l'écart.
   * Une journée à 5 156 kcal pour une cible de 3 600 se lisait donc comme un
   * manque de 1 556 kcal, avec le conseil d'ajouter du féculent.
   */
  const TRAIN = NUTRITION_TARGETS.train;
  const painDuReveil = TRAIN.meals
    .find((m) => m.name === 'Au lever — ≈ 6 h 45')!
    .items!.find((i) => i.product === 'pain')!;

  it('le plan tel qu’écrit tombe dans la tolérance', () => {
    expect(gapVerdict(TRAIN)).toBe('ok');
    expect(gapVerdict(NUTRITION_TARGETS.rest)).toBe('ok');
  });

  it('une valeur d’aliment gonflée donne un EXCÉDENT, pas un manque', () => {
    // Une étiquette mal recopiée : 2 500 kcal/100 g de pain.
    const ov: FoodOverrides = { [painDuReveil.product]: { kcal: 2500 } };
    expect(mealsGap(TRAIN, ov).kcal).toBeGreaterThan(0);
    expect(gapVerdict(TRAIN, ov)).toBe('surplus');
  });

  it('une quantité effondrée donne bien un DÉFICIT', () => {
    const ov: FoodOverrides = {};
    for (const m of TRAIN.meals) for (const i of m.items ?? []) ov[i.id] = { qty: 1 };
    expect(mealsGap(TRAIN, ov).kcal).toBeLessThan(0);
    expect(gapVerdict(TRAIN, ov)).toBe('deficit');
  });

  it('la tolérance vaut des deux côtés, symétriquement', () => {
    const cible = TRAIN.kcal;
    // Juste sous la tolérance, en excédent comme en déficit : « ok ».
    const bord = { ...TRAIN, kcal: Math.round(mealsTotal(TRAIN).kcal / 1.04) };
    expect(gapVerdict(bord)).toBe('ok');
    const large = { ...TRAIN, kcal: Math.round(mealsTotal(TRAIN).kcal / 1.2) };
    expect(gapVerdict(large)).toBe('surplus');
    expect(cible).toBe(2800); // garde-fou : le test parle bien de la vraie cible
  });
});

describe('cohérence d’une étiquette recopiée', () => {
  it('toutes les compositions du plan sont cohérentes avec leurs macros', () => {
    // Si ce test casse en ajoutant un produit, c'est le produit qui est faux,
    // pas le seuil : aucune étiquette réelle ne s'écarte de 25 %.
    for (const t of Object.values(NUTRITION_TARGETS)) {
      for (const m of t.meals) {
        for (const i of m.items ?? []) {
          expect(macrosLookWrong(i), `${i.label} (${i.kcal} kcal)`).toBe(false);
        }
      }
    }
  });

  /*
   * Le cas réel : Guillaume passe ses légumes à 416 kcal/100 g en laissant les
   * macros d'origine, qui n'en valent que 31. Rien dans l'appli ne le signalait.
   */
  it('repère des kcal que les macros ne peuvent pas produire', () => {
    const legumes = NUTRITION_TARGETS.train.meals
      .find((m) => m.name.startsWith('Dîner'))!
      .items!.find((i) => i.product === 'legumes')!;
    expect(macrosLookWrong(legumes)).toBe(false);
    expect(macrosLookWrong(legumes, { legumes: { kcal: 416 } })).toBe(true);
  });

  it('accepte une étiquette réellement dense quand ses macros suivent', () => {
    const legumes = NUTRITION_TARGETS.train.meals
      .find((m) => m.name.startsWith('Dîner'))!
      .items!.find((i) => i.product === 'legumes')!;
    // Un mélange sec de légumineuses et de graines : dense, mais cohérent.
    const ov: FoodOverrides = {
      legumes: { kcal: 416, proteinG: 22, carbsG: 48, fatG: 14 },
    };
    expect(kcalFromMacros({ proteinG: 22, carbsG: 48, fatG: 14 })).toBe(406);
    expect(macrosLookWrong(legumes, ov)).toBe(false);
  });

  it('ne dit rien quand il n’y a rien à comparer', () => {
    expect(macroCoherence({ kcal: 100, proteinG: 0, carbsG: 0, fatG: 0 })).toBeNull();
  });

  it('l’huile pure, le cas le plus dense du plan, reste cohérente', () => {
    expect(kcalFromMacros({ proteinG: 0, carbsG: 0, fatG: 100 })).toBe(900);
  });
});
