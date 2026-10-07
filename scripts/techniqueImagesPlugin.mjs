/**
 * Liste, au moment du build, les fiches techniques réellement présentes dans
 * `public/images/exercises/`, et l'expose à l'appli sous la forme d'un module
 * virtuel :
 *
 *   import files from 'virtual:technique-images';  // ['goblet-squat.webp', …]
 *
 * C'est ce qui permet de déposer les fiches une par une : le bouton « Voir le
 * mouvement » n'apparaît que pour un fichier qui existe vraiment, sans toucher
 * au code. Une fiche annoncée dans `exercises.ts` mais pas encore déposée ne
 * produit ni bouton, ni image cassée.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const VIRTUAL_ID = 'virtual:technique-images';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
const EXTENSIONS = /\.(webp|jpe?g|png)$/i; // insensible à la casse : .PNG accepté

export function techniqueImagesPlugin(root = process.cwd()) {
  const dir = join(root, 'public', 'images', 'exercises');
  const list = () => {
    try {
      return readdirSync(dir).filter((f) => EXTENSIONS.test(f)).sort();
    } catch {
      return [];
    }
  };
  return {
    name: 'technique-images',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      return id === RESOLVED_ID ? `export default ${JSON.stringify(list())};` : null;
    },
  };
}
