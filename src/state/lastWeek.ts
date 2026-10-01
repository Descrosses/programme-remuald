/**
 * La dernière semaine consultée dans l'onglet Semaine.
 *
 * Défaut corrigé : l'onglet Semaine repartait sur la semaine 1 dès qu'on
 * passait par un autre onglet. La semaine vivait dans l'URL (`#/week/2`), donc
 * elle disparaissait avec elle : en arrivant depuis Nutrition, la barre d'onglets
 * n'avait plus aucune semaine à rouvrir et retombait sur une valeur écrite en
 * dur. Consulter la semaine 9 puis vérifier une quantité au petit-déjeuner
 * ramenait en semaine 1.
 *
 * C'est un état de navigation, pas une donnée du programme : il vit dans
 * `localStorage`, comme le chrono de repos, et pour les mêmes deux raisons — il
 * doit être lu de façon SYNCHRONE (au moment où le doigt touche l'onglet, on
 * n'a pas le temps d'attendre IndexedDB) et le perdre ne coûte rien. Il y
 * survit à la fermeture complète de l'appli, ce qu'un `useState` ne fait pas.
 *
 * Ce n'est PAS la semaine du jour. L'écran Aujourd'hui continue de la calculer
 * à partir de la date de début : ce sont deux choses différentes, la semaine
 * réelle d'une part, la dernière semaine regardée de l'autre.
 */

import type { WeekIndex } from '../data/types';
import type { Route } from './useRoute';

const KEY = 'premuald:last-week';

/** Semaine 0 = combine initial, 12 = taper et tests. */
export const PREMIERE_SEMAINE = 0;
export const DERNIERE_SEMAINE = 12;

/** La semaine de repli quand rien n'a encore été consulté. */
export const SEMAINE_PAR_DEFAUT = 1 as WeekIndex;

export function isWeekIndex(n: unknown): n is WeekIndex {
  return (
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n >= PREMIERE_SEMAINE &&
    n <= DERNIERE_SEMAINE
  );
}

export function readLastWeek(): WeekIndex {
  try {
    /*
     * On teste la chaîne AVANT de la convertir : `Number(null)` et `Number('')`
     * valent 0, et 0 est une semaine valide — le combine initial. Sans ce
     * garde-fou, une clé absente ouvrait le combine au lieu de la semaine 1.
     */
    const brut = localStorage.getItem(KEY);
    if (brut === null || brut.trim() === '') return SEMAINE_PAR_DEFAUT;
    const n = Number(brut);
    return isWeekIndex(n) ? n : SEMAINE_PAR_DEFAUT;
  } catch {
    /* mode privé, quota, stockage bloqué : l'appli marche, elle oublie juste. */
    return SEMAINE_PAR_DEFAUT;
  }
}

export function writeLastWeek(week: WeekIndex): void {
  try {
    localStorage.setItem(KEY, String(week));
  } catch {
    /* idem : ne jamais faire échouer une navigation pour un souvenir. */
  }
}

/**
 * La semaine qu'ouvre un appui sur l'onglet Semaine.
 *
 * Quand on y est déjà — écran Semaine ou séance ouverte — c'est celle qu'on
 * regarde : appuyer sur l'onglet depuis la semaine 5 ne doit rien bouger.
 * Depuis n'importe quel autre onglet, c'est la dernière consultée.
 *
 * Elle n'a rien à voir avec la semaine du jour, que l'écran Aujourd'hui calcule
 * à partir de la date de début. Un lundi de la semaine 3 passé à relire la
 * semaine 12 doit rouvrir la 12, pas la 3.
 */
export function weekForTab(route: Route): WeekIndex {
  if (route.name === 'week' || route.name === 'session') return route.week;
  return readLastWeek();
}
