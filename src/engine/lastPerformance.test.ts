/**
 * « La dernière fois, tu as fait ça. »
 *
 * Ce que ces tests protègent, dans l'ordre d'importance :
 *   - le chiffre vient du RÉEL, jamais du plan ;
 *   - il parle de la dernière fois, pas de la série qu'on vient de valider ;
 *   - une baisse n'est jamais peinte comme un échec ;
 *   - un sprint plus court est une progression, pas une régression.
 */

import { describe, expect, it } from 'vitest';
import { lastPerformance } from './lastPerformance';
import type { Occurrence } from './types';
import type { DayIndex } from '../data/types';

/** Une occurrence chargée : ce que Guillaume a réellement soulevé. */
const kg = (
  week: number,
  k: number | null,
  rpe: number | null = null,
  day: DayIndex = 0,
): Occurrence => ({
  exerciseId: 'back-squat',
  week,
  day,
  kg: k,
  plannedKg: 999, // volontairement absurde : le plan ne doit JAMAIS s'afficher
  rpe,
  failed: false,
  targetRPE: null,
  completed: true,
});

/** Une occurrence mesurée : un saut, un sprint, un porté. */
const mes = (
  week: number,
  m: number | null,
  exerciseId = 'broad-jump',
  day: DayIndex = 4,
): Occurrence => ({
  exerciseId,
  week,
  day,
  kg: null,
  plannedKg: null,
  rpe: null,
  failed: false,
  targetRPE: null,
  /* Un saut n'enregistre pas de reps : `completed` vaut false, et c'est
     justement le piège que le module doit éviter. */
  completed: false,
  measure: m,
});

/** Le squat se fait le lundi ; « before » est la séance, pas la semaine. */
const squat = (occ: Occurrence[] | undefined, week: number, day: DayIndex = 0) =>
  lastPerformance(occ, { exerciseId: 'back-squat', before: { week, day } });
const saut = (
  occ: Occurrence[],
  week: number,
  unit = 'cm',
  id = 'broad-jump',
  day: DayIndex = 4,
) => lastPerformance(occ, { exerciseId: id, measureUnit: unit, before: { week, day } });

describe('les mouvements chargés', () => {
  it('affiche la charge et le RPE réellement saisis', () => {
    const p = squat([kg(1, 77.5, 7), kg(2, 80, 7.5)], 3)!;
    expect(p.week).toBe(2);
    expect(p.value).toBe('80 kg');
    expect(p.rpe).toBe('RPE 7,5');
  });

  it('ne montre JAMAIS la charge planifiée', () => {
    // `plannedKg` vaut 999 dans les fixtures : s'il apparaissait, on le verrait.
    const p = squat([kg(1, 77.5, 7), kg(2, 80, 7.5)], 3)!;
    expect(p.value).not.toContain('999');
    expect(JSON.stringify(p)).not.toContain('999');
  });

  it('une charge qui monte : flèche verte et écart', () => {
    const p = squat([kg(1, 77.5, 7), kg(2, 82.5, 7.5)], 3)!;
    expect(p.trend).toBe('up');
    expect(p.delta).toBe('+5 kg');
  });

  it('une charge identique : neutre, aucun écart', () => {
    const p = squat([kg(1, 80, 7), kg(2, 80, 7)], 3)!;
    expect(p.trend).toBe('flat');
    expect(p.delta).toBeNull();
  });

  /*
   * Le point qui compte le plus. Une semaine de deload EST une baisse de
   * charge, un ajustement orange aussi. Les peindre en rouge apprendrait à
   * ignorer la couleur le jour où elle veut dire quelque chose.
   */
  it('une charge qui baisse : neutre, jamais un échec', () => {
    const p = squat([kg(3, 87.5, 8), kg(4, 70, 5)], 5)!;
    expect(p.trend).toBe('down');
    expect(p.value).toBe('70 kg');
    expect(p.delta).toBe('−17,5 kg'); // la valeur est dite, sans jugement
  });

  it('aucun RPE saisi : on n’en invente pas', () => {
    // Speed Squat, Jump Squat : chargés, sans RPE cible.
    const p = squat([kg(1, 60), kg(2, 62.5)], 3)!;
    expect(p.rpe).toBeNull();
    expect(p.value).toBe('62,5 kg');
  });

  it('l’écart ne traîne pas de décimales parasites', () => {
    // 82,5 − 77,5 en binaire donne 5,000000000000007 si on ne l'arrondit pas.
    expect(squat([kg(1, 77.5), kg(2, 82.5)], 3)!.delta).toBe('+5 kg');
  });
});

describe('les sauts, sprints et portés', () => {
  it('affiche la mesure, sans RPE', () => {
    const p = saut([mes(1, 230), mes(2, 238)], 3)!;
    expect(p.value).toBe('238 cm');
    expect(p.rpe).toBeNull();
    expect(p.trend).toBe('up');
    expect(p.delta).toBe('+8 cm');
  });

  /*
   * `completed` vaut `false` sur un saut, parce que le champ mesure remplace
   * les reps. Filtrer dessus aurait fait disparaître l'encart sur exactement
   * les mouvements qui progressent le plus visiblement.
   */
  it('marche sur un mouvement mesuré, dont `completed` est faux', () => {
    expect(saut([mes(1, 230), mes(2, 238)], 3)).not.toBeNull();
  });

  it('un sprint plus COURT est une progression', () => {
    const p = saut([mes(0, 1.84, 'test-sprint-10m'), mes(8, 1.78, 'test-sprint-10m')], 12, 's', 'test-sprint-10m')!;
    expect(p.value).toBe('1,78 s');
    expect(p.trend).toBe('up');
    expect(p.delta).toBe('−0,06 s');
  });

  it('un sprint plus long, lui, reste neutre', () => {
    const p = saut([mes(0, 1.78, 'test-sprint-10m'), mes(8, 1.84, 'test-sprint-10m')], 12, 's', 'test-sprint-10m')!;
    expect(p.trend).toBe('down');
  });

  it('sans unité de mesure connue, on ne montre rien', () => {
    // Un chiffre sans unité ne veut rien dire : mieux vaut se taire.
    expect(
      lastPerformance([mes(1, 230)], { exerciseId: 'broad-jump', before: { week: 3, day: 4 } }),
    ).toBeNull();
  });
});

describe('quand il n’y a rien à montrer', () => {
  it('première occurrence d’un exercice : rien du tout', () => {
    // Choix assumé : en semaine 1, neuf encarts vides repousseraient les
    // champs de saisie hors de l'écran sans rien apprendre.
    expect(squat([], 1)).toBeNull();
    expect(squat(undefined, 1)).toBeNull();
  });

  it('un mouvement sans chiffre — gainage, mobilité — n’affiche rien', () => {
    expect(squat([kg(1, null), kg(2, null)], 3)).toBeNull();
  });

  it('une seule occurrence : la valeur, mais aucun écart', () => {
    const p = squat([kg(1, 77.5, 7)], 2)!;
    expect(p.value).toBe('77,5 kg');
    expect(p.delta).toBeNull();
    expect(p.trend).toBe('flat');
  });
});

describe('« la dernière fois » n’est pas aujourd’hui', () => {
  /*
   * Le piège : l'historique est reconstruit à chaque validation de série. Dès
   * la première série du jour, la semaine en cours entre dans l'index — et
   * l'encart afficherait « Semaine 3 : 82,5 kg » en parlant de la série que
   * Guillaume vient de faire, sous ses yeux.
   */
  it('la semaine en cours est exclue', () => {
    const p = squat([kg(1, 77.5, 7), kg(2, 80, 7.5), kg(3, 82.5, 8)], 3)!;
    expect(p.week).toBe(2);
    expect(p.value).toBe('80 kg');
  });

  it('les semaines à venir aussi', () => {
    // Guillaume peut ouvrir une semaine en avance et y saisir quelque chose.
    const p = squat([kg(2, 80, 7.5), kg(9, 95, 8)], 3)!;
    expect(p.week).toBe(2);
  });

  it('l’écart compare les deux dernières occurrences RÉELLES', () => {
    // Une semaine sans séance ne doit pas décaler la comparaison.
    const p = squat([kg(1, 77.5), kg(2, null), kg(5, 85)], 6)!;
    expect(p.week).toBe(5);
    expect(p.delta).toBe('+7,5 kg');
  });
});

/**
 * Le bug du Broad Jump : vendredi le voyait, samedi non.
 *
 * Le Broad Jump est le SEUL mouvement du programme qui revient deux fois dans
 * la même semaine — 5 × 2 le vendredi, 3 × 2 le samedi en potentiation du
 * deadlift. Le même identifiant dans les deux cas : ce n'était pas là le
 * problème.
 *
 * Le problème était la granularité de l'historique. Une occurrence valait une
 * SEMAINE, donc les deux séances n'en faisaient qu'une ; et comme l'encart
 * exclut la semaine en cours pour ne pas se montrer à lui-même, le saut du
 * vendredi partait avec. Résultat : aucun encart le samedi.
 */
describe('un mouvement qui revient deux fois dans la semaine', () => {
  const VEN = 4 as DayIndex;
  const SAM = 5 as DayIndex;

  it('le samedi voit le saut du vendredi de la MÊME semaine', () => {
    const p = saut([mes(2, 265, 'broad-jump', VEN)], 2, 'cm', 'broad-jump', SAM)!;
    expect(p.week).toBe(2);
    expect(p.value).toBe('265 cm');
  });

  it('le vendredi, lui, ne se voit pas lui-même', () => {
    // C'est la raison d'être de l'exclusion : sans elle, l'encart afficherait
    // la série que Guillaume vient de valider sous ses yeux.
    expect(saut([mes(2, 265, 'broad-jump', VEN)], 2, 'cm', 'broad-jump', VEN)).toBeNull();
  });

  it('et il compare bien deux séances, pas deux semaines', () => {
    const p = saut(
      [mes(2, 250, 'broad-jump', VEN), mes(2, 265, 'broad-jump', SAM)],
      3,
      'cm',
      'broad-jump',
      VEN,
    )!;
    // La dernière séance est celle du samedi, et l'écart se lit depuis vendredi.
    expect(p.value).toBe('265 cm');
    expect(p.delta).toBe('+15 cm');
  });

  it('le samedi de la semaine suivante remonte au samedi précédent, pas au vendredi', () => {
    const p = saut(
      [
        mes(2, 250, 'broad-jump', VEN),
        mes(2, 260, 'broad-jump', SAM),
        mes(3, 270, 'broad-jump', VEN),
      ],
      3,
      'cm',
      'broad-jump',
      SAM,
    )!;
    // Vendredi de la semaine 3 est la dernière séance avant samedi 3.
    expect(p.week).toBe(3);
    expect(p.value).toBe('270 cm');
    expect(p.delta).toBe('+10 cm');
  });
});

/**
 * Les portés suivent DEUX variables, et les deux progressent.
 *
 * Le Suitcase Carry se fait à 32 kg sur 30 m, puis à 32 kg sur 40 m : la
 * distance a monté, la charge non. N'afficher que la charge — ce que faisait
 * l'ancienne version — revenait à dire « Semaine 1 · 32 kg » et à effacer la
 * seule chose qui avait changé.
 */
describe('les portés — distance ET charge', () => {
  const SAM = 5 as DayIndex;

  /** Une occurrence de porté : les deux métriques à la fois. */
  const porte = (week: number, m: number, k: number): Occurrence => ({
    exerciseId: 'suitcase-carry',
    week,
    day: SAM,
    kg: k,
    plannedKg: null,
    rpe: null,
    failed: false,
    targetRPE: null,
    completed: true,
    measure: m,
  });

  const carry = (occ: Occurrence[], week: number) =>
    lastPerformance(occ, {
      exerciseId: 'suitcase-carry',
      measureUnit: 'm',
      before: { week, day: SAM },
    });

  it('affiche les deux valeurs, distance d’abord', () => {
    // L'ordre des champs de saisie juste en dessous, et celui dans lequel un
    // porté se décrit : « 40 m à 32 kg ».
    expect(carry([porte(1, 40, 32)], 2)!.value).toBe('40 m · 32 kg');
  });

  it('la distance qui monte à charge égale est une progression', () => {
    const p = carry([porte(1, 30, 32), porte(2, 40, 32)], 3)!;
    expect(p.value).toBe('40 m · 32 kg');
    expect(p.trend).toBe('up');
    expect(p.delta).toBe('+10 m');
  });

  it('la charge qui monte à distance égale aussi', () => {
    const p = carry([porte(1, 30, 32), porte(2, 30, 34)], 3)!;
    expect(p.trend).toBe('up');
    expect(p.delta).toBe('+2 kg');
  });

  it('les deux qui montent : les deux écarts sont dits', () => {
    const p = carry([porte(1, 30, 32), porte(2, 40, 34)], 3)!;
    expect(p.trend).toBe('up');
    expect(p.delta).toBe('+10 m · +2 kg');
  });

  /*
   * Plus loin mais moins lourd : ce n'est ni une progression ni un recul, c'est
   * un arbitrage. La flèche se tait et les deux écarts sont affichés — c'est à
   * Guillaume de juger, pas à une couleur.
   */
  it('l’une monte, l’autre descend : neutre, et les deux sont dits', () => {
    const p = carry([porte(1, 30, 34), porte(2, 40, 32)], 3)!;
    expect(p.trend).toBe('flat');
    expect(p.delta).toBe('+10 m · −2 kg');
  });

  it('rien ne bouge : aucun écart', () => {
    const p = carry([porte(1, 30, 32), porte(2, 30, 32)], 3)!;
    expect(p.trend).toBe('flat');
    expect(p.delta).toBeNull();
  });

  it('un deload sur les deux reste neutre, jamais un échec', () => {
    const p = carry([porte(3, 40, 34), porte(4, 20, 30)], 5)!;
    expect(p.trend).toBe('down');
    expect(p.delta).toBe('−20 m · −4 kg');
  });

  it('les mouvements à une seule métrique ne changent pas', () => {
    // Garde-fou : la nouvelle logique ne doit rien ajouter là où il n'y a
    // qu'une variable.
    expect(squat([kg(1, 77.5, 7), kg(2, 82.5, 7.5)], 3)!.value).toBe('82,5 kg');
    expect(saut([mes(1, 230), mes(2, 238)], 3)!.value).toBe('238 cm');
  });
});
