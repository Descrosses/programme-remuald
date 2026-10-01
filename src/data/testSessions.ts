/**
 * Bilans (« combines ») — programme Remuald.
 *
 * Trois bilans identiques, pour qu'ils restent comparables : semaine 0
 * (initial), semaine 8 (intermédiaire) et semaine 12 (final). Même salle, même
 * ordre, même matériel, idéalement même heure.
 *
 * Profil débutant : AUCUN test de charge maximale. On note la charge qui
 * permet 5 (ou 8) répétitions à RPE 8 — il en resterait 2 en réserve. Ces
 * chiffres servent à mesurer le progrès, jamais à calculer les charges
 * d'entraînement (modèle, guide §5).
 *
 * Consigne de départ : aucun saut, aucun sprint. L'endurance se mesure sur
 * vélo.
 *
 * Le poids de corps ne figure dans aucune séance : c'est une moyenne de 3
 * matins à jeun, relevée à la maison et saisie dans Réglages.
 */

import {
  bodyweight,
  maxSet,
  noLoad,
  reps,
  rpe,
  textLoad,
  autoreg,
  type DayIndex,
  type RampStep,
  type SessionBlueprint,
  type Slot,
  type WeekIndex,
} from './types';

const t = (exId: string, work: Slot['work'], restSec: number, note?: string): Slot => ({
  exId,
  sets: 1,
  work,
  load: noLoad(),
  targetRPE: null,
  restSec,
  ...(note ? { note } : {}),
});

const xRm = (exId: string, n: number): Slot =>
  t(exId, reps(n), 180, `Monte par paliers jusqu’à la charge qui permet ${n} répétitions à RPE 8, puis note-la.`);

// Pas de paliers de 1RM pour ce programme : conservés vides pour l'écran Combine.
export const RAMPS: Record<string, RampStep[]> = {};
export const RAMPS_S12: Record<string, RampStep[]> = {};

const MESURES_MATIN =
  'Ces trois matins : poids à jeun (moyenne), tour de taille au nombril, photos face / profil / dos. À saisir dans Réglages et Progrès.';

// ---------------------------------------------------------------------------
// Semaine 0 — bilan initial (lundi, mardi, jeudi)
// ---------------------------------------------------------------------------

const BILAN0_LUNDI: SessionBlueprint = {
  day: 0,
  title: 'Combine initial — jambes, développé couché, gainage',
  durationLabel: '≈ 60 min',
  intensity: 'TEST',
  warmup: 'lower',
  readinessTest: false,
  notes: [
    MESURES_MATIN,
    'Aucun test de charge maximale : tu notes la charge pour 5 répétitions à RPE 8.',
  ],
  slots: [
    xRm('test-leg-press-5rm', 5),
    xRm('test-bench-5rm', 5),
    t('test-plank-max', maxSet(), 0),
  ],
};

const BILAN0_MARDI: SessionBlueprint = {
  day: 1,
  title: 'Combine initial — tirage, rowing, vélo',
  durationLabel: '≈ 50 min',
  intensity: 'TEST',
  warmup: 'upper',
  readinessTest: false,
  notes: ['Le vélo en dernier : 10 min à effort soutenu, note la distance et la résistance utilisée.'],
  slots: [
    xRm('test-lat-pulldown-5rm', 5),
    xRm('test-cable-row-8rm', 8),
    t('test-bike-10min', { kind: 'time', seconds: 600 }, 0, 'Note la résistance : la même aux trois bilans.'),
  ],
};

const BILAN0_JEUDI: SessionBlueprint = {
  day: 3,
  title: 'Combine initial — hip thrust, farmer + technique',
  durationLabel: '≈ 60 min',
  intensity: 'TEST',
  warmup: 'lower',
  readinessTest: false,
  notes: [
    'Deuxième partie : séance technique, très légère. Le but est d’apprendre les gestes, pas de forcer.',
    'Dimanche : repos ou marche de 30 à 45 min. La semaine 1 commence lundi.',
  ],
  slots: [
    xRm('test-hip-thrust-8rm', 8),
    t('test-farmer-carry', maxSet(), 0, 'Haltères 2 × 20 kg, distance max sans poser.'),
    {
      exId: 'goblet-squat',
      sets: 2,
      work: reps(8),
      load: autoreg(undefined, 2, 'dbPair'),
      targetRPE: rpe(6),
      restSec: 90,
      note: 'Technique : léger.',
    },
    {
      exId: 'db-rdl',
      sets: 2,
      work: reps(8),
      load: autoreg(undefined, 2, 'dbPair'),
      targetRPE: rpe(6),
      restSec: 90,
      note: 'Technique : léger.',
    },
    {
      exId: 'back-squat',
      sets: 2,
      work: reps(8),
      load: textLoad('barre à vide'),
      targetRPE: null,
      restSec: 90,
      note: 'Découverte du geste, barre seule, dans le rack.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Bilans intermédiaire (S8) et final (S12) — jeudi + dimanche
// ---------------------------------------------------------------------------

function bilanJeudi(nom: string): SessionBlueprint {
  return {
    day: 3,
    title: `${nom} — jambes, développé couché, gainage`,
    durationLabel: '≈ 70 min',
    intensity: 'TEST',
    warmup: 'lower',
    readinessTest: false,
    notes: [MESURES_MATIN, 'Même ordre et même matériel qu’au bilan initial.'],
    slots: [
      xRm('test-leg-press-5rm', 5),
      xRm('test-bench-5rm', 5),
      xRm('test-hip-thrust-8rm', 8),
      t('test-farmer-carry', maxSet(), 0, 'Haltères 2 × 20 kg, distance max sans poser.'),
      t('test-plank-max', maxSet(), 0),
    ],
  };
}

function bilanDimanche(nom: string, fin: boolean): SessionBlueprint {
  return {
    day: 6,
    title: `${nom} — tirage, rowing, vélo`,
    durationLabel: '≈ 50 min',
    intensity: 'TEST',
    warmup: 'upper',
    readinessTest: false,
    notes: fin
      ? ['Dernière séance du programme. Note tout, puis compare avec le bilan initial dans l’onglet Combine.']
      : ['Tests d’abord, puis un peu de tronc léger.'],
    slots: [
      xRm('test-lat-pulldown-5rm', 5),
      xRm('test-cable-row-8rm', 8),
      t('test-bike-10min', { kind: 'time', seconds: 600 }, 0, 'Même vélo, même résistance qu’au bilan initial.'),
      ...(fin
        ? []
        : [
            {
              exId: 'knee-raise',
              sets: 2,
              work: reps(10),
              load: bodyweight(),
              targetRPE: rpe(6),
              restSec: 60,
            } satisfies Slot,
          ]),
    ],
  };
}

// ---------------------------------------------------------------------------

export interface SpecialSession {
  week: WeekIndex;
  day: DayIndex;
  blueprint: SessionBlueprint;
}

export const SPECIAL_SESSIONS: SpecialSession[] = [
  { week: 0, day: 0, blueprint: BILAN0_LUNDI },
  { week: 0, day: 1, blueprint: BILAN0_MARDI },
  { week: 0, day: 3, blueprint: BILAN0_JEUDI },
  { week: 8, day: 3, blueprint: bilanJeudi('Combine intermédiaire') },
  { week: 8, day: 6, blueprint: bilanDimanche('Combine intermédiaire', false) },
  { week: 12, day: 3, blueprint: bilanJeudi('Combine final') },
  { week: 12, day: 6, blueprint: bilanDimanche('Combine final', true) },
];

/** Séance écrite en toutes lettres pour cette case du calendrier, sinon `null`. */
export function specialSession(week: number, day: DayIndex): SessionBlueprint | null {
  return SPECIAL_SESSIONS.find((s) => s.week === week && s.day === day)?.blueprint ?? null;
}

/**
 * Jour de bilan ? Sert au rappel de poids de corps sur l'écran Aujourd'hui :
 * la moyenne de 3 matins doit être prête AVANT, pas relevée sur place.
 */
export function isCombineDay(week: number, day: DayIndex): boolean {
  return specialSession(week, day)?.title.startsWith('Combine') ?? false;
}

/** Les mesures relevées à chaque bilan, dans l'ordre d'affichage. */
export const COMBINE_METRICS = [
  'test-bodyweight',
  'test-waist',
  'test-leg-press-5rm',
  'test-bench-5rm',
  'test-lat-pulldown-5rm',
  'test-cable-row-8rm',
  'test-hip-thrust-8rm',
  'test-farmer-carry',
  'test-plank-max',
  'test-bike-10min',
] as const;

/** Le bilan intermédiaire mesure exactement la même chose. */
export const COMBINE_S8_METRICS = COMBINE_METRICS;

/**
 * Repères à 12 semaines, pour l'écran Combine. Volontairement relatifs : ils
 * se lisent par rapport au bilan initial.
 */
export const TARGETS_12_WEEKS: Record<string, { start: string; target: string }> = {
  'test-bodyweight': { start: 'bilan initial', target: '−0,5 à −1 kg / semaine' },
  'test-waist': { start: 'bilan initial', target: 'en baisse' },
  'test-leg-press-5rm': { start: 'bilan initial', target: 'en hausse' },
  'test-bench-5rm': { start: 'bilan initial', target: 'en hausse' },
  'test-lat-pulldown-5rm': { start: 'bilan initial', target: 'en hausse' },
  'test-cable-row-8rm': { start: 'bilan initial', target: 'en hausse' },
  'test-hip-thrust-8rm': { start: 'bilan initial', target: 'en hausse' },
  'test-farmer-carry': { start: 'bilan initial', target: 'en hausse' },
  'test-plank-max': { start: 'bilan initial', target: 'en hausse' },
  'test-bike-10min': { start: 'bilan initial', target: 'en hausse' },
};
