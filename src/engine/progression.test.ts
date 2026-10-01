/**
 * §11 — les 7 cas.
 *
 * Le scénario de référence est celui que Guillaume a écrit lui-même :
 * « S6 = 120 + 5 » quand la S5 sort à RPE 6 pour 8 prévu.
 */

import { describe, expect, it } from 'vitest';
import { rpe, rpeAtMost, rpeRange, type RPETarget } from '../data/types';
import { applyProgression, type ProgressionInput } from './progression';
import type { Occurrence } from './types';

function occ(
  week: number,
  kg: number,
  actualRpe: number | null,
  target: RPETarget | null,
  extra: Partial<Occurrence> = {},
): Occurrence {
  return {
    exerciseId: 'back-squat',
    week,
    day: 0,
    kg,
    plannedKg: kg,
    rpe: actualRpe,
    failed: false,
    targetRPE: target,
    completed: true,
    ...extra,
  };
}

function run(input: Partial<ProgressionInput> & { plannedKg: number | null }) {
  return applyProgression({
    history: [],
    targetRPE: rpe(8),
    step: 2.5,
    isLowerBody: true,
    ...input,
  });
}

// ---------------------------------------------------------------------------

describe('démarrage', () => {
  it('sans historique, on affiche la charge du tableau, sans mention de cas', () => {
    const r = run({ plannedKg: 100, history: [] });
    expect(r.case).toBeNull();
    expect(r.suggestedKg).toBe(100);
    expect(r.source).toBe('plan');
    expect(r.reason).toBe('');
    expect(r.requiresConfirm).toBe(false);
  });

  it('si la séance précédente a été sautée, idem : le tableau, sans cas', () => {
    const r = run({
      plannedKg: 105,
      history: [occ(1, 100, null, rpe(7), { completed: false })],
    });
    expect(r.case).toBeNull();
    expect(r.suggestedKg).toBe(105);
    expect(r.reason).toBe('');
  });

  it('un exercice non chargé ne produit aucune suggestion', () => {
    expect(run({ plannedKg: null }).suggestedKg).toBeNull();
  });
});

describe('cas 1 — RPE atteint = RPE prévu', () => {
  it('le programme continue de monter comme prévu au tableau', () => {
    // S1 : 100 kg à RPE 7, comme prévu. S2 : le tableau dit 105.
    const r = run({
      plannedKg: 105,
      targetRPE: rpe(7.5),
      history: [occ(1, 100, 7, rpe(7))],
    });
    expect(r.case).toBe(1);
    expect(r.suggestedKg).toBe(105);
    expect(r.offsetKg).toBe(0);
    expect(r.requiresConfirm).toBe(false);
  });

  it('« RPE ≤ 7 » ne rend jamais une séance « trop facile »', () => {
    const r = run({
      plannedKg: 52.5,
      targetRPE: rpeAtMost(7),
      history: [occ(1, 50, 5, rpeAtMost(7))],
    });
    expect(r.case).toBe(1);
    expect(r.suggestedKg).toBe(52.5);
  });

  it('une cible en fourchette est satisfaite partout dans la fourchette', () => {
    for (const ressenti of [7, 7.5, 8]) {
      const r = run({
        plannedKg: 100,
        targetRPE: rpeRange(7, 8),
        history: [occ(1, 100, ressenti, rpeRange(7, 8))],
      });
      expect(r.case, `RPE ${ressenti}`).toBe(1);
    }
  });
});

describe('cas 2 — beaucoup trop facile', () => {
  it('programme Remuald (débutant) : S5 à RPE 6 pour 8 prévu → S6 = 120 + 2,5, jamais +5', () => {
    const r = run({
      plannedKg: 120, // tableau S6
      targetRPE: rpe(8.5),
      history: [occ(5, 115, 6, rpe(8))],
    });
    expect(r.case).toBe(2);
    expect(r.suggestedKg).toBe(122.5);
    expect(r.reason).toContain('cas 2');
    expect(r.requiresConfirm).toBe(true);
  });

  it('débutant : +2,5 kg en bas comme en haut du corps — et pas davantage', () => {
    const bas = run({ plannedKg: 120, history: [occ(5, 115, 6, rpe(8))], isLowerBody: true });
    const haut = run({ plannedKg: 120, history: [occ(5, 115, 6, rpe(8))], isLowerBody: false });
    expect(bas.suggestedKg).toBe(122.5);
    expect(haut.suggestedKg).toBe(122.5);
  });

  it('se déclenche à partir de 1,5 point d’écart', () => {
    expect(run({ plannedKg: 100, history: [occ(1, 100, 6.5, rpe(8))] }).case).toBe(2);
    expect(run({ plannedKg: 100, history: [occ(1, 100, 6.6, rpe(8))] }).case).toBe(3);
  });

  it('se déclenche à partir de 1,5 point d’écart, et pas avant', () => {
    expect(run({ plannedKg: 100, history: [occ(1, 100, 6.4, rpe(8))] }).case).toBe(2);
    expect(run({ plannedKg: 100, history: [occ(1, 100, 6.6, rpe(8))] }).case).toBe(3);
  });
});

/**
 * §7 : « Ton 130 est très probablement sous-estimé : si la semaine 1 sort à
 * RPE ≤ 6, applique la règle "trop facile" dès la semaine 2. »
 *
 * Le programme nomme la règle (cas 2) au lieu de la déduire de l'écart de
 * points, qui donnerait le cas 3. Exception assumée et isolée : le deadlift
 * est la priorité n°1 du programme.
 */
describe('exception du deadlift en semaine 1', () => {
  const deadlift = (week: number, kg: number, actualRpe: number, target: RPETarget) =>
    occ(week, kg, actualRpe, target, { exerciseId: 'deadlift' });

  it('RPE 6 en S1 déclenche le cas 2 (+2,5 kg pour un débutant), pas le cas 3', () => {
    const r = run({
      plannedKg: 102.5, // tableau S2
      targetRPE: rpe(7.5),
      history: [deadlift(1, 97.5, 6, rpe(7))],
    });
    expect(r.case).toBe(2);
    expect(r.suggestedKg).toBe(105);
  });

  it('l’exception s’arrête à RPE 6 : 6,5 repasse par la règle générale', () => {
    const r = run({
      plannedKg: 102.5,
      targetRPE: rpe(7.5),
      history: [deadlift(1, 97.5, 6.5, rpe(7))],
    });
    expect(r.case).toBe(3);
    expect(r.suggestedKg).toBe(105);
  });

  it('elle ne vaut que pour la semaine 1 — même situation en S2 : cas 3', () => {
    // Seule la semaine change par rapport au test précédent.
    const r = run({
      plannedKg: 107.5,
      targetRPE: rpe(8),
      history: [deadlift(2, 102.5, 6, rpe(7))],
    });
    expect(r.case).toBe(3);
    expect(r.suggestedKg).toBe(110);
  });

  it('elle ne contamine aucun autre mouvement', () => {
    for (const id of ['back-squat', 'bench-press', 'front-squat', 'rdl', 'weighted-pullup']) {
      const r = run({
        plannedKg: 105,
        targetRPE: rpe(7.5),
        history: [occ(1, 100, 6, rpe(7), { exerciseId: id })],
      });
      expect(r.case, id).toBe(3);
    }
  });

  it('une rep ratée reste prioritaire sur l’exception', () => {
    const r = run({
      plannedKg: 102.5,
      targetRPE: rpe(7.5),
      history: [deadlift(1, 97.5, 6, rpe(7))].map((o) => ({ ...o, failed: true })),
    });
    expect(r.case).toBe(5);
  });
});

describe('cas 3 — légèrement trop facile', () => {
  it('+2,5 kg sur les gros mouvements', () => {
    const r = run({
      plannedKg: 120,
      targetRPE: rpe(8.5),
      history: [occ(5, 115, 7, rpe(8))],
    });
    expect(r.case).toBe(3);
    expect(r.suggestedKg).toBe(122.5);
    expect(r.requiresConfirm).toBe(true);
  });

  it('+2,5 kg aussi en haut du corps', () => {
    const r = run({
      plannedKg: 100,
      history: [occ(4, 100, 7, rpe(8))],
      isLowerBody: false,
    });
    expect(r.suggestedKg).toBe(102.5);
  });
});

describe('cas 4 — RPE 9 pour 8 prévu', () => {
  it('répète la même charge la semaine suivante', () => {
    const r = run({
      plannedKg: 120, // le tableau voudrait monter
      targetRPE: rpe(8.5),
      history: [occ(5, 115, 9, rpe(8))],
    });
    expect(r.case).toBe(4);
    expect(r.suggestedKg).toBe(115); // on ne monte pas
    expect(r.reason).toContain('répète');
  });

  it('deux fois de suite : le tableau est recalculé à −5 %', () => {
    const r = run({
      plannedKg: 125,
      targetRPE: rpe(9),
      history: [occ(5, 115, 9, rpe(8)), occ(6, 115, 9.5, rpe(8.5))],
    });
    expect(r.case).toBe(4);
    expect(r.suggestedKg).toBe(110); // 115 × 0,95 = 109,25 → 110
    expect(r.reason).toContain('−5 %');
  });

  it('une occurrence conforme entre les deux remet le compteur à zéro', () => {
    const r = run({
      plannedKg: 125,
      targetRPE: rpe(9),
      history: [occ(4, 110, 9, rpe(8)), occ(5, 115, 8, rpe(8)), occ(6, 120, 9, rpe(8.5))],
    });
    expect(r.case).toBe(4);
    expect(r.suggestedKg).toBe(120); // répétition simple, pas de recalcul
  });
});

describe('cas 5 — rep ratée', () => {
  it('redescend dans la fourchette −5 à −7,5 % et dit de ne pas retenter', () => {
    const r = run({
      plannedKg: 125,
      targetRPE: rpe(9),
      history: [occ(7, 120, 10, rpe(9), { failed: true })],
    });
    expect(r.case).toBe(5);
    expect(r.suggestedKg).toBe(112.5); // 120 → [111 ; 114]
    expect(r.reason).toContain('Ne retente pas');
  });

  it('l’échec prime sur le RPE ressenti', () => {
    const r = run({
      plannedKg: 125,
      history: [occ(7, 120, 6, rpe(9), { failed: true })],
    });
    expect(r.case).toBe(5);
  });
});

describe('progression cumulative — le décalage persiste', () => {
  it('un décalage acquis se reporte de semaine en semaine', () => {
    // S5 : le plan disait 115, il a fait 120 (décalage +5), RPE conforme.
    // S6 : le tableau dit 120 → 120 + 5 = 125.
    const r = run({
      plannedKg: 120,
      targetRPE: rpe(8.5),
      history: [occ(5, 120, 8, rpe(8), { plannedKg: 115 })],
    });
    expect(r.offsetKg).toBe(5);
    expect(r.case).toBe(1);
    expect(r.suggestedKg).toBe(125);
    expect(r.source).toBe('historique');
  });

  it('les décalages s’accumulent sur plusieurs semaines', () => {
    // +5 acquis en S5, +5 de plus en S6 (cas 2) → décalage total +10 en S7.
    const r = run({
      plannedKg: 125, // tableau S7
      targetRPE: rpe(9),
      history: [
        occ(5, 120, 8, rpe(8), { plannedKg: 115 }),
        occ(6, 125, 6, rpe(8.5), { plannedKg: 120 }),
      ],
    });
    expect(r.offsetKg).toBe(5);
    expect(r.case).toBe(2);
    expect(r.suggestedKg).toBe(132.5); // 125 + 5 (décalage) + 2,5 (cas 2, débutant)
  });

  it('un décalage négatif se reporte aussi', () => {
    const r = run({
      plannedKg: 120,
      targetRPE: rpe(8.5),
      history: [occ(5, 110, 8, rpe(8), { plannedKg: 115 })],
    });
    expect(r.offsetKg).toBe(-5);
    expect(r.suggestedKg).toBe(115);
  });
});

describe('bloc contraste et taper — pas de RPE cible', () => {
  it('aucune règle ne se déclenche, la charge du tableau tient', () => {
    const r = run({
      plannedKg: 117.5,
      targetRPE: null,
      history: [occ(7, 125, 9, rpe(9))],
    });
    expect(r.case).toBeNull();
    expect(r.suggestedKg).toBe(117.5);
    expect(r.requiresConfirm).toBe(false);
  });

  it('mais le décalage acquis est conservé et expliqué', () => {
    const r = run({
      plannedKg: 117.5,
      targetRPE: null,
      history: [occ(7, 130, 9, rpe(9), { plannedKg: 125 })],
    });
    expect(r.offsetKg).toBe(5);
    expect(r.suggestedKg).toBe(122.5);
    expect(r.reason).toContain('décalage');
  });
});

describe('plafond assumé (RDL S9-11)', () => {
  it('ne propose jamais au-dessus du plafond, sans erreur', () => {
    const r = run({
      plannedKg: 90,
      targetRPE: rpe(7),
      kgMax: 95,
      history: [occ(8, 95, 5, rpe(7), { plannedKg: 90 })],
    });
    expect(r.suggestedKg).toBe(95);
    expect(r.capped).toBe(true);
    expect(r.reason).toContain('plafond');
  });

  it('en dessous du plafond, la règle s’applique normalement', () => {
    const r = run({
      plannedKg: 90,
      targetRPE: rpe(7),
      kgMax: 95,
      history: [occ(8, 90, 6.5, rpe(7))],
    });
    expect(r.suggestedKg).toBe(92.5);
    expect(r.capped).toBe(false);
  });
});

describe('garde-fous', () => {
  it('toute suggestion est un multiple du pas d’arrondi', () => {
    for (const kg of [87.5, 90, 100, 102.5, 115, 117.5, 120]) {
      for (const ressenti of [5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5]) {
        const r = run({ plannedKg: kg, history: [occ(1, kg, ressenti, rpe(8))] });
        expect(Number.isInteger(r.suggestedKg! * 4), `${kg} @ RPE ${ressenti}`).toBe(true);
      }
    }
  });

  it('toute suggestion qui change la charge demande une confirmation', () => {
    for (const ressenti of [6, 7, 9]) {
      const r = run({ plannedKg: 120, history: [occ(5, 115, ressenti, rpe(8))] });
      expect(r.requiresConfirm, `RPE ${ressenti}`).toBe(true);
    }
  });
});
