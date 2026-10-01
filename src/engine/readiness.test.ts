import { describe, expect, it } from 'vitest';
import {
  READINESS_QUESTIONS,
  bestJump,
  manualRed,
  readiness,
  readinessFromAnswers,
} from './readiness';

const REF = 240; // cm

describe('§4 — feu tricolore', () => {
  it('VERT dès qu’on est à −2 % ou mieux', () => {
    expect(readiness(REF, 250)!.level).toBe('vert'); // +4,2 %
    expect(readiness(REF, 240)!.level).toBe('vert'); // 0 %
    expect(readiness(REF, 235.2)!.level).toBe('vert'); // exactement −2 %
  });

  it('ORANGE entre −2 % (exclu) et −5 % (exclu)', () => {
    expect(readiness(REF, 235)!.level).toBe('orange'); // −2,1 %
    expect(readiness(REF, 230)!.level).toBe('orange'); // −4,2 %
    expect(readiness(REF, 228.1)!.level).toBe('orange'); // −4,96 %
  });

  it('ROUGE à −5 % pile et en dessous (« −5 % ou pire »)', () => {
    expect(readiness(REF, 228)!.level).toBe('rouge'); // exactement −5 %
    expect(readiness(REF, 220)!.level).toBe('rouge'); // −8,3 %
    expect(readiness(REF, 200)!.level).toBe('rouge');
  });

  it('renvoie l’écart en pourcentage, arrondi au dixième', () => {
    expect(readiness(REF, 230)!.pctDelta).toBe(-4.2);
    expect(readiness(REF, 250)!.pctDelta).toBe(4.2);
  });

  it('dit ce que la séance va devenir', () => {
    expect(readiness(REF, 250)!.effect).toContain('Rien ne change');
    expect(readiness(REF, 230)!.effect).toContain('−5 %');
    expect(readiness(REF, 200)!.effect).toContain('60 %');
  });

  it('ne verdicte pas sans référence ni sans saisie valide', () => {
    expect(readiness(null, 230)).toBeNull();
    expect(readiness(REF, null)).toBeNull();
    expect(readiness(REF, 0)).toBeNull();
    expect(readiness(REF, -10)).toBeNull();
    expect(readiness(0, 230)).toBeNull();
    expect(readiness(REF, Number.NaN)).toBeNull();
  });

  it('le verdict est monotone : sauter plus loin ne peut pas dégrader le feu', () => {
    const ordre = { rouge: 0, orange: 1, vert: 2 };
    let precedent = -1;
    for (let cm = 200; cm <= 260; cm += 0.5) {
      const niveau = ordre[readiness(REF, cm)!.level];
      expect(niveau, `${cm} cm`).toBeGreaterThanOrEqual(precedent);
      precedent = niveau;
    }
  });
});

describe('meilleur des 3 sauts', () => {
  it('garde le meilleur et ignore les cases vides', () => {
    expect(bestJump([230, null, 245])).toBe(245);
    expect(bestJump([null, null, null])).toBeNull();
    expect(bestJump([0, -5, 210])).toBe(210);
  });
});

describe('§4 — rouge sans test', () => {
  it('exige les trois signaux, comme le programme l’écrit', () => {
    expect(manualRed({ sleepUnder5h: true, generalSoreness: true, warmupFeltHeavy: true })).toBe(true);
    expect(manualRed({ sleepUnder5h: true, generalSoreness: true, warmupFeltHeavy: false })).toBe(false);
    expect(manualRed({ sleepUnder5h: false, generalSoreness: true, warmupFeltHeavy: true })).toBe(false);
  });
});


describe('programme Remuald — forme du jour en 3 questions, sans saut', () => {
  it('pose trois questions', () => {
    expect(READINESS_QUESTIONS).toHaveLength(3);
  });

  it('ne rend aucun verdict tant qu’une question est sans réponse', () => {
    expect(readinessFromAnswers([false, null, false])).toBeNull();
    expect(readinessFromAnswers([])).toBeNull();
  });

  it('0 oui → vert, 1 oui → orange, 2 ou 3 oui → rouge', () => {
    expect(readinessFromAnswers([false, false, false])?.level).toBe('vert');
    expect(readinessFromAnswers([true, false, false])?.level).toBe('orange');
    expect(readinessFromAnswers([false, true, true])?.level).toBe('rouge');
    expect(readinessFromAnswers([true, true, true])?.level).toBe('rouge');
  });

  it('compte les « oui » dans jumpCm, réutilisé pour l’affichage', () => {
    expect(readinessFromAnswers([true, false, true])?.jumpCm).toBe(2);
  });
});
