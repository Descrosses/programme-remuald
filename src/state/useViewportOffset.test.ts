/**
 * Recoller les barres du bas à ce que l'œil voit, sur iOS.
 *
 * Le défaut : pendant qu'on fait défiler la séance, la barre de chrono remonte
 * au milieu de l'écran. Un `position: fixed` est ancré au **layout viewport**,
 * alors qu'on regarde le **visual viewport** — et sur iOS, avec une barre
 * d'état translucide et l'inertie du défilement, les deux se désolidarisent.
 *
 * Ce qui est testé ici est le calcul de l'écart. Le reste — s'abonner aux
 * événements, poser une variable CSS — n'a rien à décider.
 */

import { describe, expect, it } from 'vitest';
import { DECALAGE_MAX_PX, offsetBasViewport } from './useViewportOffset';

/** Un téléphone au repos : le visible et le layout coïncident. */
const AU_REPOS = { offsetTop: 0, visualHeight: 844, layoutHeight: 844 };

describe('quand il n’y a rien à corriger', () => {
  /*
   * Le point le plus important : partout sauf iOS en train de défiler, le
   * correctif doit être INERTE. Un contournement qui bouge quand il n'y a rien
   * à contourner est pire que le défaut qu'il corrige.
   */
  it('les deux viewports coïncident : aucun décalage', () => {
    expect(offsetBasViewport(AU_REPOS)).toBe(0);
  });

  it('un écart sous le pixel est ignoré', () => {
    // Sinon la barre vibrerait sur les arrondis de mesure.
    expect(offsetBasViewport({ ...AU_REPOS, visualHeight: 844.4 })).toBe(0);
    expect(offsetBasViewport({ ...AU_REPOS, visualHeight: 843.7 })).toBe(0);
  });

  it('une mesure aberrante ne décale rien', () => {
    // Mieux vaut le défaut d'origine qu'une barre envoyée hors de l'écran.
    expect(offsetBasViewport({ ...AU_REPOS, visualHeight: 844 + DECALAGE_MAX_PX + 1 })).toBe(0);
    expect(offsetBasViewport({ offsetTop: 0, visualHeight: 100, layoutHeight: 844 })).toBe(0);
  });

  it('des valeurs absentes ou nulles ne décalent rien', () => {
    expect(offsetBasViewport({ offsetTop: NaN, visualHeight: 844, layoutHeight: 844 })).toBe(0);
    expect(offsetBasViewport({ offsetTop: 0, visualHeight: 0, layoutHeight: 844 })).toBe(0);
    expect(offsetBasViewport({ offsetTop: 0, visualHeight: 844, layoutHeight: 0 })).toBe(0);
    expect(
      offsetBasViewport({ offsetTop: 0, visualHeight: Infinity, layoutHeight: 844 }),
    ).toBe(0);
  });
});

describe('le cas de Guillaume — la barre remontée au milieu de l’écran', () => {
  /*
   * Pendant le défilement, iOS raccourcit le visible et le décale vers le bas.
   * Le bas du visible tombe alors AVANT le bas du layout, et une barre ancrée
   * en bas du layout se dessine trop haut : c'est exactement ce qu'il a vu.
   */
  it('le visible s’arrête avant le bas du layout : la barre redescend', () => {
    const offset = offsetBasViewport({ offsetTop: 0, visualHeight: 744, layoutHeight: 844 });
    expect(offset).toBe(-100);
  });

  it('le visible décalé vers le bas : la barre suit', () => {
    // offsetTop 60 + hauteur 784 = 844 : le bas coïncide, rien à décaler.
    expect(offsetBasViewport({ offsetTop: 60, visualHeight: 784, layoutHeight: 844 })).toBe(0);
    // offsetTop 60 + hauteur 744 = 804 : il manque 40 px.
    expect(offsetBasViewport({ offsetTop: 60, visualHeight: 744, layoutHeight: 844 })).toBe(-40);
  });

  it('le décalage est rendu en pixels entiers', () => {
    expect(offsetBasViewport({ offsetTop: 0, visualHeight: 800.6, layoutHeight: 844 })).toBe(-43);
  });
});

describe('le clavier ouvert', () => {
  /*
   * Quand le clavier s'ouvre — saisie d'une remarque, d'une charge — le visible
   * se réduit d'autant. La barre remonte au-dessus du clavier au lieu de rester
   * cachée dessous. C'est un effet voulu du même calcul, pas un cas à part.
   */
  it('la barre remonte au-dessus du clavier', () => {
    const offset = offsetBasViewport({ offsetTop: 0, visualHeight: 520, layoutHeight: 844 });
    expect(offset).toBe(-324);
    expect(offset).toBeLessThan(0);
  });

  it('mais jamais au-delà du garde-fou', () => {
    // Un clavier qui laisserait moins de 400 px de visible : on renonce.
    expect(offsetBasViewport({ offsetTop: 0, visualHeight: 400, layoutHeight: 844 })).toBe(0);
  });
});
