/**
 * Mise en forme. Aucune décision métier ici — uniquement des chaînes.
 *
 * La « ligne de charge » est l'élément le plus visible de l'écran séance :
 * elle doit être lisible à un mètre, téléphone posé sur un banc.
 */

import type { Reps, Work } from '../data/types';
import type { ResolvedLoad } from './loadResolver';

/** 97.5 → « 97,5 ». Le programme est en français. */
export function fr(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** 210 → « 3:30 » — pour le chrono. */
export function mmss(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 210 → « 3 min 30 », 45 → « 45 s » — pour l'étiquette de repos. */
export function restLabel(sec: number): string {
  if (sec <= 0) return '—';
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest === 0 ? `${min} min` : `${min} min ${rest}`;
}

export function repsLabel(r: Reps): string {
  if (r === 'max') return 'max';
  if (typeof r === 'number') return String(r);
  return `${r.min}-${r.max}`;
}

/** « 5 × 3 », « 3 × 8 / jambe », « 4 × 25 m », « 8 × (20 s / 70 s) ». */
export function workLabel(sets: number, work: Work): string {
  switch (work.kind) {
    case 'reps': {
      const side = work.perSide ? ` / ${work.sideLabel ?? 'côté'}` : '';
      return `${sets} × ${repsLabel(work.reps)}${side}`;
    }
    case 'distance': {
      const side = work.perSide ? ' / côté' : '';
      return `${sets} × ${fr(work.meters)} m${side}`;
    }
    case 'time':
      return work.seconds >= 60 ? `${Math.round(work.seconds / 60)} min` : `${work.seconds} s`;
    case 'intervals':
      return `${work.rounds} × (${work.workSec} s / ${work.easySec} s)`;
    case 'attempts':
      return work.attempts === 1 ? '1 essai' : `${work.attempts} essais`;
    case 'maxSet':
      return '1 série max';
  }
}

/** « 115 kg », « +17,5 kg », « 2 × 18 kg », « 2 × 6-8 kg », « poids du corps ». */
export function loadLabel(load: ResolvedLoad): string {
  if (load.shape === 'text') return load.text ?? '';
  if (load.shape === 'bodyweight') return 'poids du corps';
  if (load.kg === null) return '';
  switch (load.shape) {
    case 'added':
      return `+${fr(load.kg)} kg`;
    case 'dbPair':
      return `2 × ${fr(load.kg)} kg`;
    default:
      return `${fr(load.kg)} kg`;
  }
}

/**
 * Combien d'haltères, et comment — dit avant de se baisser vers le rack.
 *
 * Guillaume s'est trompé de porté : il a fait le Farmer Carry à la place du
 * Suitcase Carry. Les deux se ressemblent à l'écran — marcher avec des
 * haltères — et rien ne les distinguait au moment où ça compte, c'est-à-dire
 * en attrapant la charge.
 *
 * Le rappel est DÉDUIT de la forme de charge, jamais écrit exercice par
 * exercice : `dbPair` veut dire deux haltères, `dbSingle` une seule. Un
 * mouvement à une haltère ne peut donc pas oublier son rappel, et corriger la
 * formulation la corrige partout.
 */
export function gripHint(load: ResolvedLoad): string | null {
  if (load.shape === 'dbPair') return '2 haltères — une dans chaque main';
  if (load.shape === 'dbSingle') return '1 SEULE haltère — un côté à la fois';
  return null;
}

/**
 * La grande ligne : « 5 × 3 × 115 kg », « 3 × 8 / jambe — 2 × 18 kg ».
 * Le séparateur change pour les paires d'haltères, sinon on lirait
 * « 3 × 8 / jambe × 2 × 18 kg ».
 */
export function loadLine(sets: number, work: Work, load: ResolvedLoad): string {
  const left = workLabel(sets, work);
  const right = loadLabel(load);
  if (!right) return left;
  if (load.shape === 'bodyweight' || load.shape === 'text') return `${left} — ${right}`;
  if (load.shape === 'dbPair') return `${left} — ${right}`;
  return `${left} × ${right}`;
}
