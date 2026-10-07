/**
 * Fiche technique d'un exercice : le SEUL endroit qui sait où vivent les
 * images et lesquelles existent.
 *
 * Deux conditions pour qu'une fiche s'affiche :
 *   1. l'exercice la déclare (`techniqueImage` dans `src/data/exercises.ts`) ;
 *   2. le fichier existe dans `public/images/exercises/` au moment du build.
 *
 * La seconde vient du module virtuel généré par
 * `scripts/techniqueImagesPlugin.mjs`. C'est elle qui permet de déposer les
 * fiches une par une : tant qu'un fichier manque, pas de bouton, pas d'image
 * cassée, et rien à changer dans le code le jour où il arrive.
 */

import available from 'virtual:technique-images';
import type { ExerciseDef } from '../data/types';

/** Dossier des fiches, relatif à la racine publiée de l'appli. */
export const TECHNIQUE_IMAGE_DIR = 'images/exercises/';

export interface TechniqueImage {
  src: string;
  alt: string;
}

/**
 * La fiche à afficher pour cet exercice, ou `null` s'il n'y en a pas encore.
 *
 * `BASE_URL` et non un chemin absolu : l'appli est servie sous
 * `/programme-remuald/` sur GitHub Pages, un « /images/… » y donnerait un 404.
 */
export function techniqueImageFor(
  def: Pick<ExerciseDef, 'name' | 'techniqueImage'>,
  files: readonly string[] = available,
): TechniqueImage | null {
  if (!def.techniqueImage) return null;
  // L'extension ne compte pas : « goblet-squat.png » ou « .jpg » déposé à la
  // place du « .webp » annoncé est reconnu quand même. Seul le nom compte.
  const wanted = sansExtension(def.techniqueImage);
  const file = files.find((f) => sansExtension(f) === wanted);
  if (!file) return null;
  return {
    src: `${import.meta.env.BASE_URL}${TECHNIQUE_IMAGE_DIR}${encodeURIComponent(file)}`,
    alt: `Fiche technique — ${def.name}`,
  };
}

/** « Goblet-Squat.WEBP » → « goblet-squat » : comparaison insensible à la casse. */
function sansExtension(file: string): string {
  return file.replace(/\.[^.]+$/, '').toLowerCase();
}
