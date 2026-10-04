/**
 * Saisie de la charge réellement soulevée, sur TOUS les exercices.
 *
 * Le programme chiffre une charge pour une partie des mouvements seulement.
 * Pour les autres — poulies, poids du corps, portés — l'appli n'avait aucun
 * endroit où noter ce qui a été fait. Un ab wheel lesté de 10 kg, des tractions
 * strictes à +5 kg, une poulie à 27 kg : rien ne se retrouvait dans
 * l'historique, donc rien ne pouvait alimenter §11.
 *
 * Ce module porte les deux décisions, hors de React, pour qu'elles soient
 * testables : quel champ proposer, et comment lire ce qui est tapé.
 *
 * Il ne touche PAS au plan. La ligne en gros continue d'afficher la charge
 * planifiée du .md ; ce qui est saisi ici est la charge réelle de la série.
 */

import type { ResolvedExercise } from './getSession';
import type { LoadShape } from './loadResolver';
import { parseNombre } from './numberEntry';

/** Bornes et précision de la saisie, communes au clavier et aux boutons. */
export const KG_MIN = 0;
export const KG_MAX = 300;
/** Une décimale : les disques descendent à 1,25 kg, pas en dessous. */
export const KG_DECIMALES = 1;

/**
 * Pas des boutons +/−.
 *
 * 2,5 kg sur une barre, c'est le plus petit disque de chaque côté. Partout
 * ailleurs — haltères, poulies, lest de ceinture — l'incrément réel est plus
 * fin, et forcer 2,5 empêcherait de noter la charge qu'on a vraiment mise.
 */
export function stepForShape(shape: LoadShape): number {
  return shape === 'barbell' ? 2.5 : 1;
}

/**
 * Ce que le champ affiche tant que rien n'est saisi.
 *
 * « PDC » et non « — » dès que le mouvement se fait au poids du corps : il n'y
 * a pas absence de charge, il y a le corps de Guillaume. Le champ sert alors à
 * noter un lest, et l'écrire ainsi évite de croire à un champ oublié.
 *
 * `none` compte comme poids du corps : c'est la forme des sauts, des sprints et
 * du conditioning, que le programme ne charge pas mais qui ne se font pas pour
 * autant « sans rien ». Restent à « — » les mouvements dont la charge est
 * décrite en toutes lettres (`text`) ou portée par du matériel — une poulie
 * vide n'est pas le poids du corps.
 */
export function emptyLabelForShape(shape: LoadShape): string {
  return shape === 'bodyweight' || shape === 'none' ? 'PDC' : '—';
}

export interface LoadEntry {
  step: number;
  emptyLabel: string;
  /**
   * Valeur de départ du champ : la charge planifiée quand le programme en
   * donne une, sinon la dernière réellement enregistrée sur cet exercice.
   */
  initialKg: number | null;
}

/** Le champ de charge d'un exercice résolu. Il y en a toujours un. */
export function loadEntryFor(ex: ResolvedExercise, saved?: number | null): LoadEntry {
  return {
    step: stepForShape(ex.load.shape),
    emptyLabel: emptyLabelForShape(ex.load.shape),
    initialKg: saved ?? ex.load.kg ?? ex.lastKg ?? null,
  };
}

/**
 * Lit ce qui a été tapé au pavé numérique.
 *
 * Règle unique : en cas de doute, on garde la valeur précédente. Un champ vidé
 * par erreur, une faute de frappe, un collage bizarre ne doivent jamais écrire
 * un NaN ni un 0 dans l'historique — un 0 passerait pour une série faite à
 * vide, et fausserait la progression de la semaine suivante.
 *
 * Accepte la virgule ET le point : le clavier décimal d'un iPhone en français
 * envoie une virgule, un collage depuis ailleurs envoie souvent un point.
 */
export function parseKg(raw: string, previous: number | null): number | null {
  return parseNombre(raw, previous, { min: KG_MIN, max: KG_MAX, decimales: KG_DECIMALES });
}
