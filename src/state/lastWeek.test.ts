/**
 * La semaine consultée survit au changement d'onglet, et au redémarrage.
 *
 * Défaut corrigé : consulter la semaine 2, aller voir Nutrition, revenir sur
 * l'onglet Semaine — et retomber sur la semaine 1. La semaine ne vivait que
 * dans l'URL, donc elle disparaissait dès qu'on quittait l'écran, et la barre
 * d'onglets rouvrait une valeur écrite en dur.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SEMAINE_PAR_DEFAUT,
  readLastWeek,
  weekForTab,
  writeLastWeek,
} from './lastWeek';
import type { Route } from './useRoute';
import type { WeekIndex } from '../data/types';

/** localStorage de test — le même que celui du chrono de repos. */
function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  return store;
}

beforeEach(() => stubStorage());

describe('la semaine consultée se retient', () => {
  it('rien de noté : on ouvre la semaine 1, comme avant', () => {
    expect(readLastWeek()).toBe(SEMAINE_PAR_DEFAUT);
  });

  it('ce qui est noté est relu tel quel, de la 0 à la 12', () => {
    for (let w = 0; w <= 12; w++) {
      writeLastWeek(w as WeekIndex);
      expect(readLastWeek(), `semaine ${w}`).toBe(w);
    }
  });

  it('une valeur abîmée ne fait pas planter la navigation', () => {
    // Stockage partagé, mise à jour ratée, bidouille : on retombe sur le
    // défaut plutôt que d'ouvrir une semaine qui n'existe pas.
    for (const brut of ['', 'deux', '13', '-1', '2,5', 'NaN']) {
      stubStorage({ 'premuald:last-week': brut });
      expect(readLastWeek(), JSON.stringify(brut)).toBe(SEMAINE_PAR_DEFAUT);
    }
  });

  it('un stockage bloqué n’empêche pas d’ouvrir l’onglet', () => {
    // Mode privé, quota plein : l'appli oublie, elle ne casse pas.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
    });
    expect(() => writeLastWeek(5 as WeekIndex)).not.toThrow();
    expect(readLastWeek()).toBe(SEMAINE_PAR_DEFAUT);
  });
});

describe('quelle semaine ouvre l’onglet Semaine', () => {
  const nutrition: Route = { name: 'nutrition' };

  it('le scénario de Guillaume : semaine 2 → Nutrition → Semaine = 2', () => {
    // 1. Il consulte la semaine 2 — l'appli la note.
    const semaine2: Route = { name: 'week', week: 2 as WeekIndex };
    writeLastWeek(semaine2.week);
    // 2. Il passe sur Nutrition.
    // 3. Il rappuie sur l'onglet Semaine.
    expect(weekForTab(nutrition)).toBe(2);
  });

  it('ça vaut depuis TOUS les autres onglets', () => {
    writeLastWeek(9 as WeekIndex);
    const ailleurs: Route[] = [
      { name: 'today' },
      { name: 'nutrition' },
      { name: 'progress' },
      { name: 'combine' },
      { name: 'settings' },
    ];
    for (const r of ailleurs) expect(weekForTab(r), r.name).toBe(9);
  });

  it('depuis l’écran Semaine, l’onglet ne bouge pas la semaine affichée', () => {
    writeLastWeek(2 as WeekIndex);
    expect(weekForTab({ name: 'week', week: 7 as WeekIndex })).toBe(7);
  });

  it('une séance ouverte compte comme sa semaine', () => {
    // Sortir de la séance du samedi de la semaine 6 doit ramener en semaine 6.
    writeLastWeek(1 as WeekIndex);
    expect(weekForTab({ name: 'session', week: 6 as WeekIndex, day: 5 })).toBe(6);
  });

  it('après un redémarrage complet, la semaine est toujours là', () => {
    // Le stockage survit à la fermeture de l'appli : on simule le redémarrage
    // en repartant d'une session vierge avec le même contenu stocké.
    writeLastWeek(11 as WeekIndex);
    stubStorage({ 'premuald:last-week': '11' });
    expect(weekForTab({ name: 'today' })).toBe(11);
  });

  it('ne se confond pas avec la semaine du jour', () => {
    /*
     * Deux états différents. L'écran Aujourd'hui calcule la vraie semaine à
     * partir de la date de début ; celui-ci ne retient que ce qui a été
     * regardé. Un lundi de la semaine 3 passé à relire la semaine 12 doit
     * rouvrir la 12.
     */
    writeLastWeek(12 as WeekIndex);
    expect(weekForTab({ name: 'today' })).toBe(12);
  });
});
