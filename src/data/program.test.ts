/**
 * Programme Remuald — les consignes qui ne doivent jamais casser.
 *
 * Ces tests protègent ce qui a été décidé avant le démarrage :
 *   - consigne de départ : aucun saut, aucun sprint, travail adaptatif ;
 *   - profil débutant : plafond de RPE 8 sur tout le programme ;
 *   - quatre séances par semaine, lundi, mardi, jeudi, dimanche ;
 *   - tractions lestées remplacées par le tirage vertical ;
 *   - plan alimentaire : les repas valent bien leur somme d'aliments.
 *
 * Si l'un d'eux casse, le déploiement s'arrête : mieux vaut pas de mise à jour
 * qu'une séance qui contredit une consigne médicale.
 */

import { describe, expect, it } from 'vitest';
import { BASE_SESSIONS } from './baseSessions';
import { BLOCK_RULES, CONTRAST_BY_DAY } from './blockRules';
import { EXERCISES } from './exercises';
import { NUTRITION_TARGETS } from './nutrition';
import { TRAINING_DAYS, WEEK_DAYS } from './program';
import { COMBINE_METRICS, SPECIAL_SESSIONS } from './testSessions';
import type { WeekIndex } from './types';
import { getSession, hasSession, type ResolvedSession } from '../engine/getSession';
import { mealMacros, mealsGap } from '../engine/nutrition';
import { EMPTY_CONTEXT, type SessionContext } from '../engine/types';

const CTX: SessionContext = {
  ...EMPTY_CONTEXT,
  settings: { ...EMPTY_CONTEXT.settings, startDate: '2026-10-05' },
};

/** Toutes les séances du programme, semaine 0 comprise. */
function toutes(): Array<{ week: WeekIndex; session: ResolvedSession }> {
  const out: Array<{ week: WeekIndex; session: ResolvedSession }> = [];
  for (let w = 0; w <= 12; w++) {
    const week = w as WeekIndex;
    for (const day of WEEK_DAYS[week]) {
      if (!hasSession(week, day)) continue;
      const session = getSession(week, day, CTX);
      expect(session, `S${week} jour ${day}`).not.toBeNull();
      out.push({ week, session: session! });
    }
  }
  return out;
}

describe('calendrier', () => {
  it('quatre séances par semaine : lundi, mardi, jeudi, dimanche', () => {
    expect([...TRAINING_DAYS]).toEqual([0, 1, 3, 6]);
    for (let w = 1; w <= 12; w++) expect(WEEK_DAYS[w as WeekIndex], `S${w}`).toEqual([0, 1, 3, 6]);
  });

  it('le bilan initial tient sur lundi, mardi et jeudi', () => {
    expect(WEEK_DAYS[0]).toEqual([0, 1, 3]);
  });

  it('chaque jour d’entraînement a sa trame', () => {
    for (const day of TRAINING_DAYS) expect(BASE_SESSIONS[day], `jour ${day}`).toBeDefined();
  });
});

describe('consigne de départ : aucun saut, aucun sprint', () => {
  it('le catalogue ne contient aucun mouvement de saut', () => {
    for (const ex of Object.values(EXERCISES)) {
      expect(ex.fn, ex.id).not.toBe('jump');
      expect(ex.explosive ?? false, ex.id).toBe(false);
      expect(/jump|sprint|pogo|bound|saut/i.test(ex.id), ex.id).toBe(false);
    }
  });

  it('aucune séance des 13 semaines ne propose un saut', () => {
    for (const { week, session } of toutes()) {
      for (const ex of session.exercises) {
        expect(ex.def.fn, `S${week} ${session.title} — ${ex.id}`).not.toBe('jump');
      }
    }
  });

  it('pas de contraste (il reposait sur des sauts)', () => {
    expect(Object.keys(CONTRAST_BY_DAY)).toEqual([]);
  });
});

describe('profil débutant', () => {
  it('aucune cible de RPE au-dessus de 8, sur aucune séance', () => {
    for (const { week, session } of toutes()) {
      for (const ex of session.exercises) {
        if (ex.targetRPE === null) continue;
        expect(ex.targetRPE.max, `S${week} ${session.title} — ${ex.id}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it('aucune charge n’est imposée : tout se règle au RPE à la première séance', () => {
    for (const { week, session } of toutes()) {
      for (const ex of session.exercises) {
        expect(ex.load.kg, `S${week} ${session.title} — ${ex.id}`).toBeNull();
      }
    }
  });

  it('le Goblet Squat ouvre les semaines 1-4, le squat barre arrive en semaine 5', () => {
    for (const w of [1, 2, 3] as WeekIndex[]) {
      const ids = getSession(w, 0, CTX)!.exercises.map((e) => e.id);
      expect(ids[0], `S${w}`).toBe('goblet-squat');
      expect(ids, `S${w}`).not.toContain('back-squat');
    }
    for (const w of [5, 6, 7, 9, 10, 11] as WeekIndex[]) {
      const ids = getSession(w, 0, CTX)!.exercises.map((e) => e.id);
      expect(ids[0], `S${w}`).toBe('back-squat');
      expect(ids, `S${w}`).not.toContain('goblet-squat');
    }
  });
});

describe('découverte du squat barre', () => {
  it('pas de squat barre au bilan initial : un seul squat par séance, le Goblet', () => {
    for (const day of WEEK_DAYS[0]) {
      const ids = getSession(0, day, CTX)!.exercises.map((e) => e.id);
      expect(ids, `S0 jour ${day}`).not.toContain('back-squat');
    }
  });

  it('semaine 4 : 2 × 8 barre seule après le Goblet, pour filmer le geste avant la semaine 5', () => {
    const ids = getSession(4, 0, CTX)!.exercises.map((e) => e.id);
    expect(ids.indexOf('back-squat')).toBe(ids.indexOf('goblet-squat') + 1);
    const squat = getSession(4, 0, CTX)!.exercises.find((e) => e.id === 'back-squat')!;
    expect(squat.sets).toBe(2);
    expect(squat.loadLine).toContain('barre seule');
  });
});

describe('tractions lestées → tirage vertical', () => {
  it('le tirage vertical est présent chaque mardi, jamais de tractions lestées', () => {
    expect(EXERCISES['weighted-pullup']).toBeUndefined();
    for (let w = 1; w <= 12; w++) {
      const ids = getSession(w as WeekIndex, 1, CTX)!.exercises.map((e) => e.id);
      expect(ids, `S${w}`).toContain('lat-pulldown');
    }
  });
});

describe('cohérence des données', () => {
  it('chaque exercice cité dans une trame, une règle ou un bilan existe au catalogue', () => {
    const cites = [
      ...Object.values(BASE_SESSIONS).flatMap((b) => b!.slots.map((s) => s.exId)),
      ...SPECIAL_SESSIONS.flatMap((s) => s.blueprint.slots.map((x) => x.exId)),
      ...BLOCK_RULES.flatMap((r) =>
        r.rules.map((x) => (x.op === 'insert' ? x.slot.exId : x.exId)),
      ),
      ...COMBINE_METRICS,
    ];
    for (const id of cites) expect(EXERCISES[id], id).toBeDefined();
  });

  it('chaque règle de bloc vise un exercice réellement présent ce jour-là', () => {
    for (const set of BLOCK_RULES) {
      const trame = BASE_SESSIONS[set.day!]!.slots.map((s) => s.exId);
      for (const r of set.rules) {
        if (r.op === 'insert') continue;
        expect(trame, `${set.block} jour ${set.day} — ${r.exId}`).toContain(r.exId);
      }
    }
  });

  it('les trois bilans mesurent la même chose', () => {
    const s0 = SPECIAL_SESSIONS.filter((s) => s.week === 0).flatMap((s) => s.blueprint.slots);
    const s12 = SPECIAL_SESSIONS.filter((s) => s.week === 12).flatMap((s) => s.blueprint.slots);
    const tests = (slots: typeof s0) => slots.filter((x) => x.exId.startsWith('test-')).map((x) => x.exId).sort();
    expect(tests(s12)).toEqual(tests(s0));
  });
});

describe('plan alimentaire', () => {
  it('chaque repas vaut exactement la somme de ses aliments', () => {
    for (const t of Object.values(NUTRITION_TARGETS)) {
      for (const m of t.meals) {
        const calc = mealMacros(m);
        expect(calc.kcal, `${t.label} — ${m.name} (kcal)`).toBe(m.kcal);
        expect(calc.proteinG, `${t.label} — ${m.name} (protéines)`).toBe(m.proteinG);
      }
    }
  });

  it('les repas tombent sur la cible, aux deux paliers', () => {
    expect(Math.abs(mealsGap(NUTRITION_TARGETS.train).pct)).toBeLessThan(5);
    expect(Math.abs(mealsGap(NUTRITION_TARGETS.rest).pct)).toBeLessThan(5);
  });

  it('cinq prises par jour, les mêmes protéines ou presque les jours de repos', () => {
    expect(NUTRITION_TARGETS.train.meals).toHaveLength(5);
    expect(NUTRITION_TARGETS.rest.meals).toHaveLength(5);
    expect(NUTRITION_TARGETS.rest.proteinG).toBeGreaterThanOrEqual(NUTRITION_TARGETS.train.proteinG - 15);
    expect(NUTRITION_TARGETS.rest.kcal).toBeLessThan(NUTRITION_TARGETS.train.kcal);
  });

  it('aucun repas n’est placé pendant une coupure du chantier', () => {
    for (const t of Object.values(NUTRITION_TARGETS)) {
      for (const m of t.meals) {
        expect(/\b(9|10|14|15) h(?! 45)/.test(m.name), `${t.label} — ${m.name}`).toBe(false);
      }
    }
  });
});
