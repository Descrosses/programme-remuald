/**
 * Saisie manuelle de la charge, sur tout le programme.
 *
 * Avant, seuls les mouvements que le .md chiffre avaient un champ de charge.
 * Une poulie à 27 kg, un ab wheel lesté de 10 kg, des tractions strictes à
 * +5 kg n'avaient nulle part où être notés : ils sortaient de l'historique,
 * donc de §11.
 */

import { describe, expect, it } from 'vitest';
import { getSession, hasSession } from './getSession';
import { KG_MAX, emptyLabelForShape, loadEntryFor, parseKg, stepForShape } from './loadEntry';
import { EMPTY_CONTEXT, type HistoryIndex, type SessionContext } from './types';
import { WEEK_DAYS } from '../data/program';
import type { DayIndex, WeekIndex } from '../data/types';

const CTX: SessionContext = {
  ...EMPTY_CONTEXT,
  settings: { ...EMPTY_CONTEXT.settings, startDate: '2026-09-07' },
};

/** Toutes les cases du calendrier qui portent une séance, combines compris. */
function toutesLesSeances(ctx: SessionContext = CTX) {
  const out: Array<{ week: WeekIndex; day: DayIndex; session: ReturnType<typeof getSession> }> = [];
  for (let w = 0; w <= 12; w++) {
    const week = w as WeekIndex;
    for (const day of WEEK_DAYS[week]) {
      if (!hasSession(week, day)) continue;
      out.push({ week, day, session: getSession(week, day, ctx) });
    }
  }
  return out;
}

describe('lecture du pavé numérique', () => {
  it('« 37,5 » donne 37,5 — la virgule est la touche décimale d’un clavier français', () => {
    expect(parseKg('37,5', null)).toBe(37.5);
    expect(parseKg('37.5', null)).toBe(37.5);
    expect(parseKg(' 37,5 ', null)).toBe(37.5);
  });

  /*
   * La règle qui protège l'historique : en cas de doute, on garde ce qu'il y
   * avait. Un 0 écrit à la place passerait pour une série faite à vide et
   * ferait baisser la charge proposée la semaine suivante.
   */
  it('une saisie illisible ou vide garde la valeur précédente, jamais NaN ni 0', () => {
    expect(parseKg('abc', 20)).toBe(20);
    expect(parseKg('', 20)).toBe(20);
    expect(parseKg('   ', 20)).toBe(20);
    expect(parseKg('12kg', 20)).toBe(20);
    expect(parseKg('--5', 20)).toBe(20);
    expect(parseKg('1,2,3', 20)).toBe(20);
    // Et quand il n'y avait rien, il n'y a toujours rien.
    expect(parseKg('abc', null)).toBeNull();
    for (const saisie of ['abc', '', '12kg', '--5']) {
      expect(Number.isNaN(parseKg(saisie, 20) as number), saisie).toBe(false);
    }
  });

  it('refuse ce qui sort des bornes, sans rien écrire', () => {
    expect(parseKg('-5', 20)).toBe(20);
    expect(parseKg('301', 20)).toBe(20);
    expect(parseKg('0', 20)).toBe(0); // 0 explicite : c'est une saisie valide
    expect(parseKg(String(KG_MAX), 20)).toBe(KG_MAX);
  });

  it('arrondit à une décimale', () => {
    expect(parseKg('37,55', null)).toBe(37.6);
    expect(parseKg('37,44', null)).toBe(37.4);
    expect(parseKg('100,00', null)).toBe(100);
  });
});

describe('le pas des boutons +/−', () => {
  it('2,5 kg sur une barre, 1 kg partout ailleurs', () => {
    expect(stepForShape('barbell')).toBe(2.5);
    for (const forme of ['added', 'dbPair', 'dbSingle', 'cable', 'bodyweight', 'none'] as const) {
      expect(stepForShape(forme), forme).toBe(1);
    }
  });

  it('un mouvement au poids du corps affiche « PDC » et non « — »', () => {
    expect(emptyLabelForShape('bodyweight')).toBe('PDC');
    // Sauts, sprints, conditioning : pas de charge planifiée, mais le corps est
    // bien la charge. Guillaume les cite explicitement (box jump, pogo).
    expect(emptyLabelForShape('none')).toBe('PDC');
    // Une poulie vide ou un « 2 × 6-8 kg » écrit en toutes lettres, non.
    expect(emptyLabelForShape('cable')).toBe('—');
    expect(emptyLabelForShape('text')).toBe('—');
  });
});

describe('un champ de charge sur CHAQUE exercice du programme', () => {
  it('les 12 semaines et les combines exposent tous un champ', () => {
    const seances = toutesLesSeances();
    expect(seances).toHaveLength(51); // 12 × 4 + les 3 jours du bilan initial
    let exercices = 0;

    for (const { week, day, session } of seances) {
      expect(session, `S${week} jour ${day}`).not.toBeNull();
      for (const ex of session!.exercises) {
        const entry = loadEntryFor(ex);
        expect(entry.step, `${ex.id} (S${week} jour ${day})`).toBeGreaterThan(0);
        expect(entry.emptyLabel.length, `${ex.id}`).toBeGreaterThan(0);
        exercices += 1;
      }
    }
    expect(exercices).toBeGreaterThan(250);
  });

  it('les mouvements au poids du corps proposent bien « PDC » par défaut', () => {
    const auPDC = ['dead-bug', 'knee-raise', 'plank', 'zone2-cardio'];
    const vus = new Set<string>();
    for (const { session } of toutesLesSeances()) {
      for (const ex of session?.exercises ?? []) {
        if (!auPDC.includes(ex.id)) continue;
        vus.add(ex.id);
        const entry = loadEntryFor(ex);
        expect(entry.initialKg, ex.id).toBeNull();
        expect(entry.emptyLabel, ex.id).toBe('PDC');
      }
    }
    expect([...vus].sort()).toEqual(['dead-bug', 'knee-raise', 'plank', 'zone2-cardio']);
  });

  it('programme Remuald : aucune charge imposée la première fois, le champ est vide', () => {
    // Débutant, pas de 1RM : la charge se choisit au RPE à la première séance.
    const jeudi = getSession(1, 3, CTX)!;
    const rdl = jeudi.exercises.find((e) => e.id === 'rdl')!;
    expect(rdl.load.kg).toBeNull();
    expect(loadEntryFor(rdl).initialKg).toBeNull();
  });
});

describe('une charge saisie en S1 est reproposée en S2', () => {
  /** Historique minimal : une occurrence complétée à la charge donnée. */
  const historique = (
    exerciseId: string,
    week: number,
    kg: number,
    day: DayIndex = 4,
  ): HistoryIndex => ({
    [exerciseId]: [
      {
        exerciseId,
        week,
        day,
        kg,
        plannedKg: null,
        rpe: 6,
        targetRPE: null,
        failed: false,
        completed: true,
      },
    ],
  });

  it('une poulie notée à 37,5 kg revient à 37,5 kg la semaine suivante', () => {
    const exId = 'one-arm-cable-row';
    const avant = getSession(1, 6, CTX)!.exercises.find((e) => e.id === exId)!;
    expect(loadEntryFor(avant).initialKg, 'aucune charge la première fois').toBeNull();

    const ctx: SessionContext = { ...CTX, history: historique(exId, 1, 37.5, 6) };
    const apres = getSession(2, 6, ctx)!.exercises.find((e) => e.id === exId)!;
    expect(apres.lastKg).toBe(37.5);
    expect(loadEntryFor(apres).initialKg).toBe(37.5);
  });

  it('un lest noté sur un mouvement au poids du corps revient aussi', () => {
    const exId = 'dead-bug';
    const ctx: SessionContext = { ...CTX, history: historique(exId, 1, 10) };
    const apres = getSession(2, 0, ctx)!.exercises.find((e) => e.id === exId)!;
    // Le plan reste au poids du corps : c'est le CHAMP qui se souvient, pas la
    // ligne de charge.
    expect(apres.load.kg).toBeNull();
    expect(apres.loadLine).toContain('poids du corps');
    expect(loadEntryFor(apres).initialKg).toBe(10);
  });
});
