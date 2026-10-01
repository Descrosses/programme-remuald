/**
 * Modifications par bloc, encodées comme des règles — programme Remuald.
 *
 * Personne ne recopie une séance douze fois : l'engine part des quatre trames
 * de `baseSessions.ts` et applique les règles ci-dessous selon le bloc de la
 * semaine. Corriger un bloc, c'est corriger une ligne ici.
 *
 * Profil débutant (modèle §2.3) : pas de contraste, plafond de RPE 8 sur tout
 * le programme. Consigne de départ : aucun saut.
 */

import {
  autoreg,
  reps,
  rpeRange,
  type Block,
  type DayIndex,
  type LoadSpec,
  type RPETarget,
  type Slot,
  type Work,
} from './types';
import { zone2 } from './baseSessions';

// ---------------------------------------------------------------------------
// Formes de règles
// ---------------------------------------------------------------------------

export interface SlotPatch {
  sets?: number;
  work?: Work;
  restSec?: number;
  targetRPE?: RPETarget | null;
  /** Multiplie la charge résolue. */
  loadFactor?: number;
  load?: LoadSpec;
  note?: string;
  /** Id de l'exercice explosif intercalé entre les séries (inutilisé ici : pas de contraste). */
  contrastWith?: string;
}

export type SlotRule =
  | { op: 'patch'; exId: string; patch: SlotPatch }
  | { op: 'remove'; exId: string }
  | { op: 'insert'; slot: Slot; after?: string; atStart?: true };

export interface BlockRuleSet {
  block: Block;
  /** Absent = s'applique à tous les jours du bloc. */
  day?: DayIndex;
  rules: SlotRule[];
  notes?: string[];
}

const patch = (exId: string, p: SlotPatch): SlotRule => ({ op: 'patch', exId, patch: p });
const remove = (exId: string): SlotRule => ({ op: 'remove', exId });
const replaceZone2 = (minutes: number): SlotRule[] => [
  remove('zone2-cardio'),
  { op: 'insert', slot: zone2(minutes) },
];

// ---------------------------------------------------------------------------
// Deload — semaines 4 et 8 (et allègement de la semaine 12)
// ---------------------------------------------------------------------------

/**
 * S'applique par rôle (principal et accessoire) : 80 % de la charge RÉELLE de
 * la dernière séance du même exercice, 2 séries, RPE 6 au plus. Le cardio en
 * zone 2 est conservé, le fractionné est retiré.
 */
export const DELOAD_POLICY = {
  accessorySets: 2,
  accessoryLoadFactor: 0.8,
  jumpVolumeDivisor: 2,
  maxRPE: 6,
  removeExIds: ['conditioning'],
  notes: [
    'Semaine allégée : 2 séries par exercice à −20 %, zéro série au-dessus de RPE 6.',
    'Pas de fractionné. Le cardio en zone 2 reste.',
  ],
} as const;

// ---------------------------------------------------------------------------
// Semaines 5-7 — Force + muscle
// ---------------------------------------------------------------------------

const PRINCIPAL_FORCE: SlotPatch = { sets: 4, work: reps({ min: 5, max: 6 }), targetRPE: rpeRange(7.5, 8) };
const ACCESSOIRE_FORCE: SlotPatch = { sets: 3, work: reps({ min: 8, max: 10 }), targetRPE: rpeRange(7.5, 8) };

const squatBarre = (sets: number, r: { min: number; max: number }, restSec: number): SlotRule => ({
  op: 'insert',
  atStart: true,
  slot: {
    exId: 'back-squat',
    sets,
    work: reps(r),
    load: autoreg(undefined, 2.5, 'barbell'),
    targetRPE: rpeRange(7.5, 8),
    restSec,
    note: 'Si ton coach n’a pas encore validé ta technique : fais ce schéma au Goblet Squat.',
  },
});

const MAXFORCE: BlockRuleSet[] = [
  {
    block: 'maxforce',
    day: 0,
    notes: ['Le squat barre remplace le Goblet Squat — uniquement si ta technique est validée.'],
    rules: [
      remove('goblet-squat'),
      squatBarre(4, { min: 5, max: 6 }, 180),
      patch('leg-press', ACCESSOIRE_FORCE),
      patch('db-rdl', ACCESSOIRE_FORCE),
      patch('leg-curl', ACCESSOIRE_FORCE),
      ...replaceZone2(30),
    ],
  },
  {
    block: 'maxforce',
    day: 1,
    rules: [
      patch('bench-press', { ...PRINCIPAL_FORCE, restSec: 180 }),
      patch('lat-pulldown', { ...PRINCIPAL_FORCE, restSec: 150 }),
      patch('chest-supported-row', ACCESSOIRE_FORCE),
      patch('db-shoulder-press', ACCESSOIRE_FORCE),
      ...replaceZone2(30),
    ],
  },
  {
    block: 'maxforce',
    day: 3,
    rules: [
      patch('hip-thrust', { ...PRINCIPAL_FORCE, restSec: 120 }),
      patch('rdl', { ...PRINCIPAL_FORCE, restSec: 180 }),
      patch('single-leg-press', { ...ACCESSOIRE_FORCE, work: reps({ min: 8, max: 10 }, true, 'jambe') }),
      patch('seated-leg-curl', ACCESSOIRE_FORCE),
      ...replaceZone2(30),
    ],
  },
  {
    block: 'maxforce',
    day: 6,
    rules: [
      patch('incline-db-press', ACCESSOIRE_FORCE),
      patch('neutral-lat-pulldown', ACCESSOIRE_FORCE),
      patch('conditioning', {
        work: { kind: 'intervals', rounds: 6, workSec: 20, easySec: 100 },
        note: 'Et pas davantage.',
      }),
    ],
  },
];

// ---------------------------------------------------------------------------
// Semaines 9-11 — Muscle + densité (remplace le contraste, profil débutant)
// ---------------------------------------------------------------------------

const PRINCIPAL_DENSITE: SlotPatch = { sets: 4, work: reps({ min: 6, max: 8 }), targetRPE: rpeRange(7.5, 8) };
const ACCESSOIRE_DENSITE: SlotPatch = {
  sets: 3,
  work: reps({ min: 10, max: 12 }),
  targetRPE: rpeRange(7.5, 8),
  restSec: 75,
};

const POWER: BlockRuleSet[] = [
  {
    block: 'power',
    day: 0,
    notes: ['Bloc muscle + densité : plus de répétitions, repos plus courts sur les accessoires.'],
    rules: [
      remove('goblet-squat'),
      squatBarre(4, { min: 6, max: 8 }, 150),
      patch('leg-press', ACCESSOIRE_DENSITE),
      patch('db-rdl', ACCESSOIRE_DENSITE),
      patch('leg-curl', ACCESSOIRE_DENSITE),
      ...replaceZone2(40),
    ],
  },
  {
    block: 'power',
    day: 1,
    rules: [
      patch('bench-press', { ...PRINCIPAL_DENSITE, restSec: 150 }),
      patch('lat-pulldown', { ...PRINCIPAL_DENSITE, restSec: 120 }),
      patch('chest-supported-row', ACCESSOIRE_DENSITE),
      patch('db-shoulder-press', ACCESSOIRE_DENSITE),
      ...replaceZone2(40),
    ],
  },
  {
    block: 'power',
    day: 3,
    rules: [
      patch('hip-thrust', { ...PRINCIPAL_DENSITE, restSec: 120 }),
      patch('rdl', { ...PRINCIPAL_DENSITE, restSec: 150 }),
      patch('single-leg-press', { ...ACCESSOIRE_DENSITE, work: reps({ min: 10, max: 12 }, true, 'jambe') }),
      patch('seated-leg-curl', ACCESSOIRE_DENSITE),
      patch('adductor-machine', ACCESSOIRE_DENSITE),
      ...replaceZone2(40),
    ],
  },
  {
    block: 'power',
    day: 6,
    rules: [
      patch('incline-db-press', { ...ACCESSOIRE_DENSITE, sets: 4 }),
      patch('neutral-lat-pulldown', { ...ACCESSOIRE_DENSITE, sets: 4 }),
      patch('one-arm-cable-row', { sets: 3, work: reps({ min: 10, max: 12 }, true), restSec: 60 }),
    ],
  },
];

/**
 * Pas de contraste dans ce programme : profil débutant (modèle §2.3) et
 * aucun saut (consigne de départ).
 */
export interface ContrastSpec {
  heavy: string;
  explosive: string;
  explosiveReps: number;
  restAfterHeavySec: number;
  restAfterExplosiveSec: number;
  cycleLabel: string;
}

export const CONTRAST_BY_DAY: Partial<Record<DayIndex, ContrastSpec>> = {};

export const BLOCK_RULES: BlockRuleSet[] = [...MAXFORCE, ...POWER];

/** Règles applicables à une séance donnée. */
export function rulesFor(block: Block, day: DayIndex): SlotRule[] {
  return BLOCK_RULES.filter((r) => r.block === block && (r.day === undefined || r.day === day)).flatMap(
    (r) => r.rules,
  );
}

/** Notes de bloc à afficher en tête de séance. */
export function blockNotesFor(block: Block, day: DayIndex): string[] {
  return BLOCK_RULES.filter((r) => r.block === block && (r.day === undefined || r.day === day)).flatMap(
    (r) => r.notes ?? [],
  );
}
