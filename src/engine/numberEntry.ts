/**
 * Lire un nombre tapé au clavier du téléphone.
 *
 * Une seule règle, et c'est elle qui compte : **en cas de doute, on garde la
 * valeur précédente**. Un champ vidé par erreur, une faute de frappe, un
 * collage bizarre ne doivent jamais écrire un `NaN` ni un 0 dans l'historique —
 * un 0 passerait pour une performance faite à vide et fausserait tout ce qui
 * s'appuie dessus.
 *
 * Accepte la virgule ET le point : le clavier décimal d'un iPhone en français
 * envoie une virgule, un collage depuis ailleurs envoie souvent un point.
 *
 * Cette fonction existe parce que la même lecture était déjà écrite deux fois
 * dans l'appli — une pour les charges, une pour les aliments. Une troisième
 * copie ailleurs aurait garanti qu’elles divergent.
 */

export interface BornesSaisie {
  min: number;
  max: number;
  /** Nombre de décimales conservées. 0 pour une mesure entière. */
  decimales: number;
}

export function parseNombre(
  raw: string,
  previous: number | null,
  bornes: BornesSaisie,
): number | null {
  const nettoye = raw.trim().replace(',', '.').replace(/\s/g, '');
  if (nettoye === '') return previous;
  // Chiffres et au plus un point. « 12kg », « --5 », « 1,2,3 » sont rejetés.
  if (!/^\d*\.?\d*$/.test(nettoye)) return previous;
  const n = Number(nettoye);
  // Attrape le cas « . » seul, qui passe la regex mais ne vaut rien.
  if (!Number.isFinite(n)) return previous;
  if (n < bornes.min || n > bornes.max) return previous;
  const facteur = 10 ** bornes.decimales;
  return Math.round(n * facteur) / facteur;
}
