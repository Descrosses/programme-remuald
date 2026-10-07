/**
 * Remplacer un aliment d'un repas par un autre.
 *
 * Ce qui est protégé ici :
 *   - le plan du .md n'est JAMAIS réécrit ;
 *   - un remplacement ne touche que la ligne, pas le produit ailleurs ;
 *   - l'état cru/cuit est une donnée, pas une phrase ;
 *   - la cascade portion → repas → journée passe par le même chemin de calcul.
 *
 * Le plan de Remuald nomme ses lignes de façon générique — « Viande ou
 * poisson », « Féculent », « Légumes ». C'est justement ce qui rend le
 * remplacement utile ici : il sert à dire LEQUEL a été mangé.
 */

import { describe, expect, it } from 'vitest';
import { NUTRITION_TARGETS, type FoodItem } from '../data/nutrition';
import { FOOD_LIBRARY, searchFoods, type LibraryFood } from '../data/foodLibrary';
import {
  effectiveItem,
  isEdited,
  itemMacros,
  macrosLookWrong,
  mealMacros,
  mealsTotal,
  quantiteApresRemplacement,
  type Catalogue,
  type FoodOverrides,
} from './nutrition';

const TRAIN = NUTRITION_TARGETS.train;
const MIDI = TRAIN.meals.find((m) => m.name.startsWith('Entre 11 h 45'))!;
const viande = MIDI.items!.find((i) => i.product === 'viande')!;
const feculent = MIDI.items!.find((i) => i.product === 'feculent')!;

/** Un aliment personnalisé, comme la base en rendrait un. */
const MAISON: LibraryFood = {
  id: 'custom.tofu',
  label: 'Tofu ferme',
  unit: 'g',
  per: 100,
  kcal: 145,
  proteinG: 16,
  carbsG: 2,
  fatG: 8,
  referenceState: 'cru',
  category: 'proteine',
  isCustom: true,
};
const AVEC_MAISON: Catalogue = { ...FOOD_LIBRARY, [MAISON.id]: MAISON };

describe('« Viande ou poisson » 180 g → saumon 180 g', () => {
  const ov: FoodOverrides = { [viande.id]: { productId: 'saumon' } };

  it('la portion prend les valeurs du saumon, à quantité conservée', () => {
    const e = effectiveItem(viande, ov);
    expect(e.label).toBe('Saumon');
    expect(e.qty).toBe(180);
    // Saumon à 208 kcal/100 g → 180 g en valent 374,4.
    expect(itemMacros(viande, ov).kcal).toBeCloseTo(374.4, 1);
    expect(itemMacros(viande, ov).proteinG).toBeCloseTo(36, 1);
  });

  it('le repas suit', () => {
    // Viande 180 g = 306 kcal ; saumon 180 g = 374,4. Soit +68 après l'arrondi
    // unique du repas.
    expect(mealMacros(MIDI).kcal).toBe(666);
    expect(mealMacros(MIDI, ov).kcal).toBe(734);
  });

  it('la journée suit', () => {
    const avant = mealsTotal(TRAIN).kcal;
    expect(mealsTotal(TRAIN, ov).kcal - avant).toBe(68);
    // Et la journée reste la somme exacte de ses repas.
    const somme = TRAIN.meals.reduce((n, m) => n + mealMacros(m, ov).kcal, 0);
    expect(mealsTotal(TRAIN, ov).kcal).toBe(somme);
  });

  it('la ligne est signalée comme modifiée', () => {
    expect(isEdited(viande, {})).toBe(false);
    expect(isEdited(viande, ov)).toBe(true);
  });
});

describe('saumon 180 g → 250 g', () => {
  it('les quatre macros se recalculent sur la nouvelle quantité', () => {
    const ov: FoodOverrides = { [viande.id]: { productId: 'saumon', qty: 250 } };
    const e = effectiveItem(viande, ov);
    expect(e.qty).toBe(250);
    const m = itemMacros(viande, ov);
    expect(m.kcal).toBeCloseTo(520, 1); // 208 × 2,5
    expect(m.proteinG).toBeCloseTo(50, 1);
    expect(m.carbsG).toBeCloseTo(0, 1);
    expect(m.fatG).toBeCloseTo(32.5, 1);
  });

  it('et la journée aussi, sans recalcul à la main', () => {
    const a = mealsTotal(TRAIN, { [viande.id]: { productId: 'saumon', qty: 180 } }).kcal;
    const b = mealsTotal(TRAIN, { [viande.id]: { productId: 'saumon', qty: 250 } }).kcal;
    expect(b - a).toBe(146); // 70 g de saumon
  });
});

describe('« Féculent » → riz, et le cru/cuit', () => {
  it('le remplacement respecte l’état de référence', () => {
    const ov: FoodOverrides = { [feculent.id]: { productId: 'riz' } };
    const e = effectiveItem(feculent, ov);
    expect(e.label).toBe('Riz cuit');
    expect(e.qty).toBe(180);
    expect(e.referenceState).toBe('cuit');
  });

  /*
   * Le piège que l'état de référence existe pour éviter : 100 g de riz cru
   * valent 350 kcal, 100 g de riz cuit 130. Les deux sont dans la
   * bibliothèque, comme DEUX aliments distincts, et leur libellé le dit.
   */
  it('riz cru et riz cuit sont deux aliments différents, et le disent', () => {
    expect(FOOD_LIBRARY.riz!.referenceState).toBe('cuit');
    expect(FOOD_LIBRARY.rizCru!.referenceState).toBe('cru');
    expect(FOOD_LIBRARY.rizCru!.kcal).toBeGreaterThan(FOOD_LIBRARY.riz!.kcal * 2);
    expect(FOOD_LIBRARY.riz!.label).toContain('cuit');
    expect(FOOD_LIBRARY.rizCru!.label).toContain('cru');
  });

  it('tout aliment qui change de masse à la cuisson déclare son état', () => {
    for (const f of Object.values(FOOD_LIBRARY)) {
      expect(['cru', 'cuit', 'na'], f.label).toContain(f.referenceState);
      // Un libellé qui dit « cuit » doit porter l'état « cuit », et l'inverse.
      if (/\bcuit/i.test(f.label)) expect(f.referenceState, f.label).toBe('cuit');
      if (/\bcru/i.test(f.label)) expect(f.referenceState, f.label).toBe('cru');
    }
  });

  /*
   * La bibliothèque est bâtie sur les produits du plan plus des alternatives.
   * Un identifiant présent des deux côtés ferait silencieusement gagner l'un
   * des deux, et deux « Flocons d'avoine » apparaîtraient dans la liste.
   */
  it('aucun aliment n’est livré deux fois', () => {
    const libelles = Object.values(FOOD_LIBRARY).map((f) => f.label);
    expect(new Set(libelles).size).toBe(libelles.length);
    const ids = Object.values(FOOD_LIBRARY).map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('aliment personnalisé saisi pour 100 g', () => {
  it('la portion se calcule toute seule depuis les valeurs /100 g', () => {
    const ov: FoodOverrides = { [viande.id]: { productId: MAISON.id } };
    const m = itemMacros(viande, ov, AVEC_MAISON);
    // 180 g de tofu à 145 kcal/100 g.
    expect(m.kcal).toBeCloseTo(261, 1);
    expect(m.proteinG).toBeCloseTo(28.8, 1);
  });

  it('il se cherche comme les autres', () => {
    expect(searchFoods('tofu', [MAISON]).map((f) => f.id)).toContain(MAISON.id);
    expect(searchFoods('tofu', []).length).toBe(0);
  });

  it('sa quantité se recalcule comme pour un aliment livré', () => {
    const ov: FoodOverrides = { [viande.id]: { productId: MAISON.id, qty: 250 } };
    expect(itemMacros(viande, ov, AVEC_MAISON).kcal).toBeCloseTo(362.5, 1);
  });
});

describe('le plan modèle n’est jamais touché', () => {
  /*
   * Le point le plus important de tout le mécanisme. Les repas de
   * `src/data/nutrition.ts` sont la transcription du .md, en lecture seule ;
   * ce qui change vit à côté, dans les overrides. C'est ce qui rend le retour
   * en arrière possible, et ce qui empêche le plan et sa source de diverger.
   */
  it('remplacer ne modifie pas l’objet du plan', () => {
    const avant = JSON.stringify(viande);
    const ov: FoodOverrides = { [viande.id]: { productId: 'saumon', qty: 999 } };
    effectiveItem(viande, ov);
    itemMacros(viande, ov);
    mealsTotal(TRAIN, ov);
    expect(JSON.stringify(viande)).toBe(avant);
    expect(viande.product).toBe('viande');
  });

  it('sans override, tout revient exactement au .md', () => {
    expect(effectiveItem(viande, {})).toBe(viande);
    expect(mealsTotal(TRAIN, {})).toEqual(mealsTotal(TRAIN));
  });

  it('un remplacement ne touche QUE la ligne, pas le produit ailleurs', () => {
    // La même « Viande ou poisson » est au dîner : elle ne doit pas bouger.
    const viandeDiner = TRAIN.meals
      .find((m) => m.name.startsWith('Dîner'))!
      .items!.find((i) => i.product === 'viande')!;
    expect(viandeDiner.id).not.toBe(viande.id);
    const ov: FoodOverrides = { [viande.id]: { productId: 'saumon' } };
    expect(effectiveItem(viande, ov).label).toBe('Saumon');
    expect(effectiveItem(viandeDiner, ov).label).toBe('Viande ou poisson');
  });
});

describe('la journée est la somme exacte des repas', () => {
  it('avec ou sans modification', () => {
    const jeux: FoodOverrides[] = [
      {},
      { [viande.id]: { productId: 'saumon' } },
      { [feculent.id]: { productId: 'pommesDeTerre', qty: 400 } },
      { [viande.id]: { productId: MAISON.id }, [feculent.id]: { qty: 250 } },
    ];
    for (const ov of jeux) {
      const jour = mealsTotal(TRAIN, ov, AVEC_MAISON);
      const somme = TRAIN.meals.reduce(
        (acc, m) => {
          const x = mealMacros(m, ov, AVEC_MAISON);
          return {
            kcal: acc.kcal + x.kcal,
            proteinG: acc.proteinG + x.proteinG,
            carbsG: acc.carbsG + x.carbsG,
            fatG: acc.fatG + x.fatG,
          };
        },
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      );
      expect(jour).toEqual(somme);
    }
  });
});

describe('un plan d’avant la fonctionnalité continue de marcher', () => {
  it('une ligne sans remplacement se comporte exactement comme avant', () => {
    // Un override écrit avant la v10 n'a pas de `productId` : c'est « aucun
    // remplacement », pas une erreur.
    const ancien: FoodOverrides = { [viande.id]: { qty: 200 }, viande: { kcal: 180 } };
    const e = effectiveItem(viande, ancien);
    expect(e.product).toBe('viande');
    expect(e.qty).toBe(200);
    expect(e.kcal).toBe(180);
  });

  it('un remplacement vers un aliment introuvable ne casse rien', () => {
    // Aliment personnalisé supprimé depuis, base restaurée ailleurs : on
    // retombe sur l'aliment du plan plutôt que d'afficher du vide.
    const ov: FoodOverrides = { [viande.id]: { productId: 'custom.disparu' } };
    expect(effectiveItem(viande, ov).product).toBe('viande');
    expect(itemMacros(viande, ov).kcal).toBeCloseTo(306, 1);
  });
});

describe('la quantité après un changement d’unité', () => {
  /*
   * Remplacer 180 g de viande par une banane donnerait 180 bananes si on
   * gardait le nombre : l'unité passe de « g » à « unité » et le chiffre ne
   * veut plus rien dire.
   */
  it('se conserve quand l’unité ne change pas', () => {
    expect(quantiteApresRemplacement(viande, FOOD_LIBRARY.saumon!)).toBe(180);
  });

  it('repart de 1 pour ce qui se compte', () => {
    expect(quantiteApresRemplacement(viande, FOOD_LIBRARY.banane!)).toBe(1);
    expect(effectiveItem(viande, { [viande.id]: { productId: 'banane' } }).qty).toBe(1);
  });

  it('repart de 100 pour ce qui se pèse', () => {
    const banane = TRAIN.meals
      .find((m) => m.name.startsWith('15 h 45'))!
      .items!.find((i) => i.product === 'banane')!;
    expect(quantiteApresRemplacement(banane, FOOD_LIBRARY.saumon!)).toBe(100);
  });

  it('une quantité saisie prime toujours sur la valeur de départ', () => {
    const ov: FoodOverrides = { [viande.id]: { productId: 'banane', qty: 2 } };
    expect(effectiveItem(viande, ov).qty).toBe(2);
  });
});

describe('la composition se corrige sous l’aliment RÉELLEMENT mangé', () => {
  /*
   * Après un remplacement, recopier une étiquette doit atterrir sous le saumon,
   * pas sous « Viande ou poisson ». Sinon la correction serait invisible ici et
   * s'appliquerait à la viande des autres repas.
   */
  it('l’étiquette du remplaçant s’applique, celle du remplacé non', () => {
    const base: FoodOverrides = { [viande.id]: { productId: 'saumon' } };
    expect(itemMacros(viande, { ...base, saumon: { kcal: 250 } }).kcal).toBeCloseTo(450, 1);
    expect(itemMacros(viande, { ...base, viande: { kcal: 999 } }).kcal).toBeCloseTo(374.4, 1);
  });
});

describe('l’aliment remplaçant apporte AUSSI son état et sa famille', () => {
  /*
   * L'état cru/cuit est la donnée qui évite de compter le triple : 100 g de riz
   * cru valent 350 kcal, cuits 130. La ligne l'affiche, et la feuille de
   * remplacement l'affiche. Après un remplacement, c'est l'état de l'aliment
   * RÉELLEMENT mangé qui doit s'afficher — pas celui de la ligne du plan, qui
   * ne décrit plus rien.
   */
  it('remplacer le féculent cuit par du riz cru dit « cru »', () => {
    const ov: FoodOverrides = { [feculent.id]: { productId: 'rizCru' } };
    const e = effectiveItem(feculent, ov);
    expect(e.label).toBe('Riz cru');
    expect(e.referenceState).toBe('cru');
  });

  /*
   * La famille sert à ouvrir la feuille de remplacement sur la bonne liste.
   * Après une viande remplacée par une banane, rouvrir « Remplacer » doit
   * proposer des fruits, pas des protéines.
   */
  it('la famille suit aussi', () => {
    const ov: FoodOverrides = { [viande.id]: { productId: 'banane' } };
    const e = effectiveItem(viande, ov);
    expect(e.category).toBe('fruit');
    expect(e.referenceState).toBe('na');
  });

  it('sans remplacement, rien ne change', () => {
    expect(effectiveItem(feculent, {}).referenceState).toBe('cuit');
    expect(effectiveItem(viande, {}).category).toBe('proteine');
  });

  /*
   * Garde-fou général : après un remplacement, tout ce qui décrit l'aliment
   * doit venir du remplaçant. Un champ oublié ici est un champ qui mentira à
   * l'écran, et la liste des champs grandira encore.
   */
  it('tout ce qui décrit l’aliment vient du remplaçant', () => {
    for (const id of ['saumon', 'rizCru', 'banane', 'pates', 'avocat'] as const) {
      const f = FOOD_LIBRARY[id]!;
      const e = effectiveItem(viande, { [viande.id]: { productId: id } });
      expect(
        {
          label: e.label,
          unit: e.unit,
          per: e.per,
          kcal: e.kcal,
          proteinG: e.proteinG,
          carbsG: e.carbsG,
          fatG: e.fatG,
          referenceState: e.referenceState,
          category: e.category,
        },
        f.label,
      ).toEqual({
        label: f.label,
        unit: f.unit,
        per: f.per,
        kcal: f.kcal,
        proteinG: f.proteinG,
        carbsG: f.carbsG,
        fatG: f.fatG,
        referenceState: f.referenceState,
        category: f.category,
      });
    }
  });
});

describe('validation d’un aliment personnalisé', () => {
  it('signale des kcal que les macros ne peuvent pas produire', () => {
    const faux: FoodItem = { ...viande, kcal: 500, proteinG: 80, carbsG: 80, fatG: 50 };
    // 80×4 + 80×4 + 50×9 = 1 090 kcal, pour 500 annoncées.
    expect(macrosLookWrong(faux)).toBe(true);
  });

  it('accepte un aliment cohérent', () => {
    expect(macrosLookWrong({ ...viande, ...MAISON })).toBe(false);
    for (const f of Object.values(FOOD_LIBRARY)) {
      expect(macrosLookWrong({ ...viande, ...f }), f.label).toBe(false);
    }
  });
});
