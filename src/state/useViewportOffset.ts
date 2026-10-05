/**
 * Recoller les barres du bas à ce que l'œil voit, sur iOS.
 *
 * Défaut constaté en salle : pendant qu'on fait défiler la séance, la barre de
 * chrono remonte au milieu de l'écran au lieu de rester en bas.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Un élément en `position: fixed` est placé par rapport au **layout viewport**,
 * la page telle que le navigateur la met en page. Mais ce qu'on voit est le
 * **visual viewport**, qui peut être décalé et plus court : barre d'état
 * translucide (`viewport-fit=cover` + `black-translucent`), inertie de
 * défilement, clavier qui s'ouvre. Sur iOS les deux se désolidarisent pendant
 * le scroll, et une barre ancrée en bas du layout se dessine au milieu de ce
 * qu'on regarde.
 *
 * Ce n'est pas une erreur de CSS : sur un navigateur de bureau, et dans
 * Chromium même en émulation mobile, la barre reste collée au bas à chaque
 * position de défilement. Le `position: fixed` est correct ; c'est l'ancrage
 * d'iOS qui ne l'est pas.
 *
 * ── Le correctif ────────────────────────────────────────────────────────────
 *
 * On mesure l'écart entre le bas du visual viewport et le bas du layout
 * viewport, et on décale les barres d'autant. Quand les deux coïncident —
 * c'est-à-dire partout ailleurs qu'iOS en train de défiler — l'écart vaut 0 et
 * il ne se passe rien. Le correctif est donc inerte là où il n'y a rien à
 * corriger, ce qui est exactement ce qu'on veut d'un contournement.
 */

import { useEffect, useState } from 'react';

export interface MesuresViewport {
  /** De combien le visual viewport est décalé vers le bas dans le layout. */
  offsetTop: number;
  /** Hauteur réellement visible. */
  visualHeight: number;
  /** Hauteur du layout viewport (`documentElement.clientHeight`). */
  layoutHeight: number;
}

/**
 * Garde-fou : au-delà, ce n'est plus un décalage de défilement mais une mesure
 * aberrante — on préfère ne rien décaler qu'envoyer la barre hors de l'écran.
 */
export const DECALAGE_MAX_PX = 400;

/**
 * De combien REMONTER une barre ancrée en bas pour qu'elle touche le bas de ce
 * qui est visible.
 *
 * Toujours négatif ou nul, et c'est le point important.
 *
 * La première version rendait aussi des valeurs positives, en supposant qu'un
 * visible débordant vers le bas demandait de descendre la barre. C'est faux :
 * la barre est déjà ancrée au bas du layout viewport, la descendre encore ne
 * peut que la pousser hors de l'écran. Sur iPhone, avec `viewport-fit=cover`
 * et une barre d'état translucide, l'écart restait positif en permanence — et
 * les libellés des onglets passaient sous le bord de l'écran, page immobile.
 * Constaté sur l'appli dont celle-ci est issue, qui porte le même code.
 *
 * Un décalage vers le bas ne corrige donc rien, jamais. On l'ignore.
 */
export function offsetBasViewport(m: MesuresViewport): number {
  const valeurs = [m.offsetTop, m.visualHeight, m.layoutHeight];
  if (valeurs.some((v) => !Number.isFinite(v))) return 0;
  if (m.visualHeight <= 0 || m.layoutHeight <= 0) return 0;

  const ecart = m.offsetTop + m.visualHeight - m.layoutHeight;
  // Le visible déborde vers le bas : rien à corriger, et rien à casser.
  if (ecart > 0) return 0;
  // Sous le pixel, le décalage ne se voit pas et ferait vibrer la barre.
  if (-ecart < 1) return 0;
  if (-ecart > DECALAGE_MAX_PX) return 0;
  return Math.round(ecart);
}

/**
 * L'écart courant, en pixels, à appliquer aux barres du bas.
 *
 * Vaut 0 partout où `visualViewport` n'existe pas — le contournement ne doit
 * jamais être une condition de fonctionnement.
 */
export function useViewportOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let frame = 0;
    const mesurer = () => {
      cancelAnimationFrame(frame);
      // Une mesure par image : `scroll` sur le visual viewport tire à vue.
      frame = requestAnimationFrame(() => {
        setOffset(
          offsetBasViewport({
            offsetTop: vv.offsetTop,
            visualHeight: vv.height,
            layoutHeight: document.documentElement.clientHeight,
          }),
        );
      });
    };

    mesurer();
    vv.addEventListener('resize', mesurer);
    vv.addEventListener('scroll', mesurer);
    window.addEventListener('orientationchange', mesurer);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', mesurer);
      vv.removeEventListener('scroll', mesurer);
      window.removeEventListener('orientationchange', mesurer);
    };
  }, []);

  return offset;
}
