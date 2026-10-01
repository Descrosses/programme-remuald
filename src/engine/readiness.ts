/**
 * §4 — Readiness test : 3 broad jumps après l'échauffement, on garde le
 * meilleur, on le compare à la référence figée du combine initial.
 *
 *   ≥ −2 %        → VERT   : séance complète
 *   −2 % à −5 %   → ORANGE : −5 % sur les gros mouvements, une série
 *                            d'accessoires en moins
 *   ≤ −5 %        → ROUGE  : pas de RPE 8+, technique 3 × 3 à 65 %, tronc,
 *                            mobilité, et tu rentres
 *
 * Le « ou pire » de « −5 % ou pire → ROUGE » est inclusif : à exactement
 * −5 %, c'est rouge. C'est la lecture prudente, et la seule qui rende les
 * deux bornes du .md non contradictoires.
 */

import { READINESS_THRESHOLDS } from '../data/program';
import type { ReadinessLevel, ReadinessResult } from './types';

const LABELS: Record<ReadinessLevel, string> = {
  vert: 'VERT — séance complète.',
  orange: 'ORANGE — tu es un peu émoussé, la séance s’allège.',
  rouge: 'ROUGE — pas de travail lourd aujourd’hui.',
};

const EFFECTS: Record<ReadinessLevel, string> = {
  vert: 'Rien ne change.',
  orange:
    '−5 % sur les gros mouvements et une série de moins sur les accessoires. C’est déjà appliqué ci-dessous.',
  rouge:
    'Exercices principaux en technique légère (3 × 3 à 60 % de ta dernière charge), tronc et 20 min de zone 2 conservés, tout le reste retiré. Tu rentres.',
};

/**
 * Programme Remuald — readiness SANS SAUT (consigne de départ : aucun saut
 * au début). Trois questions, posées après l'échauffement des séances jambes :
 */
export const READINESS_QUESTIONS = [
  'Moins de 6 h de sommeil cette nuit ?',
  'Journée de travail très physique, ou courbatures dans tout le corps ?',
  'Échauffement anormalement lourd ?',
] as const;

/**
 *   0 oui    → VERT
 *   1 oui    → ORANGE
 *   2-3 oui  → ROUGE
 *
 * Les champs `jumpCm` / `baselineCm` / `pctDelta` du résultat sont réutilisés :
 * `jumpCm` porte le nombre de « oui », les deux autres valent 0.
 *
 * @param answers une réponse par question ; `null` = pas encore répondu
 * @returns `null` tant que les trois questions n'ont pas de réponse
 */
export function readinessFromAnswers(answers: Array<boolean | null>): ReadinessResult | null {
  if (answers.length < READINESS_QUESTIONS.length) return null;
  if (answers.some((a) => a === null || a === undefined)) return null;
  const yes = answers.filter((a) => a === true).length;
  const level: ReadinessLevel = yes === 0 ? 'vert' : yes === 1 ? 'orange' : 'rouge';
  return {
    level,
    pctDelta: 0,
    jumpCm: yes,
    baselineCm: 0,
    label: LABELS[level],
    effect: EFFECTS[level],
  };
}

/**
 * @param baselineCm référence figée (meilleur broad jump du combine initial)
 * @param jumpCm     meilleur des 3 sauts du jour
 * @returns `null` si la référence n'est pas encore définie ou si la saisie est invalide
 */
export function readiness(baselineCm: number | null, jumpCm: number | null): ReadinessResult | null {
  if (baselineCm === null || jumpCm === null) return null;
  if (!Number.isFinite(baselineCm) || !Number.isFinite(jumpCm)) return null;
  if (baselineCm <= 0 || jumpCm <= 0) return null;

  const pctDelta = ((jumpCm - baselineCm) / baselineCm) * 100;
  const level = levelFor(pctDelta);

  return {
    level,
    pctDelta: Math.round(pctDelta * 10) / 10,
    jumpCm,
    baselineCm,
    label: LABELS[level],
    effect: EFFECTS[level],
  };
}

function levelFor(pctDelta: number): ReadinessLevel {
  // Marge de 1e-9 : 148/150 doit donner exactement −1,333 %, pas −2,0000001 %.
  if (pctDelta >= READINESS_THRESHOLDS.greenPct - 1e-9) return 'vert';
  if (pctDelta > READINESS_THRESHOLDS.orangePct + 1e-9) return 'orange';
  return 'rouge';
}

/**
 * §4 — Le rouge se déclenche aussi sans test : « moins de 5 h de sommeil +
 * courbatures généralisées + échauffement anormalement lourd ». Les trois
 * conditions sont cumulatives dans le programme.
 */
export function manualRed(signals: {
  sleepUnder5h: boolean;
  generalSoreness: boolean;
  warmupFeltHeavy: boolean;
}): boolean {
  return signals.sleepUnder5h && signals.generalSoreness && signals.warmupFeltHeavy;
}

/** Meilleur des essais saisis, en ignorant les cases vides. */
export function bestJump(attempts: Array<number | null>): number | null {
  const valid = attempts.filter((a): a is number => a !== null && Number.isFinite(a) && a > 0);
  return valid.length === 0 ? null : Math.max(...valid);
}
