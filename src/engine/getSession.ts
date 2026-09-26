/**
 * `getSession(week, day, ctx)` — la séance du jour, déjà ajustée.
 *
 * Ordre des transformations, et il compte :
 *   1. trame de départ  — §12 / §8 S12 si la séance est écrite en toutes
 *                         lettres, sinon la trame §7 du jour ;
 *   2. règles de bloc   — §8, pour force max et puissance ;
 *   3. deload           — §8, semaines 4 et 8, sur les séances non écrites ;
 *   4. tableau §9       — séries, reps, charge et RPE des lifts principaux ;
 *   5. progression      — §11, en SUGGESTION, jamais appliquée d'office ;
 *   6. feu tricolore    — §4, appliqué à la charge affichée ET à la suggestion ;
 *   7. cas 7            — §11, sauts en baisse : 3 séries, plus de conditioning.
 */

import {
  BIG_MOVEMENT_IDS,
  BLOCKS,
  DELOAD_POLICY,
  READINESS_THRESHOLDS,
  WEEK_BLOCKS,
  WEEK_DAYS,
  blockNotesFor,
  rulesFor,
} from '../data/program';
import { BASE_SESSIONS } from '../data/baseSessions';
import { CONTRAST_BY_DAY, type ContrastSpec, type SlotPatch } from '../data/blockRules';
import { EXERCISES } from '../data/exercises';
import { prescriptionFor } from '../data/mainLiftTable';
import { specialSession } from '../data/testSessions';
import { WARMUPS } from '../data/warmups';
import type {
  Block,
  DayIndex,
  ExerciseDef,
  Intensity,
  RampStep,
  RPETarget,
  Slot,
  Warmup,
  WeekIndex,
  Work,
} from '../data/types';
import { loadLine as formatLoadLine } from './format';
import { resolveLoad, scaleLoad, withKg, type ResolvedLoad } from './loadResolver';
import { applyProgression, lastCompleted, type ProgressionResult } from './progression';
import { roundToStep } from './rounding';
import type { OneRMKey, SessionContext } from './types';

// ---------------------------------------------------------------------------

export interface Adjustment {
  source: 'bloc' | 'deload' | 'orange' | 'rouge' | 'cas7' | 'plafond';
  what: string;
  why: string;
}

export interface ResolvedExercise {
  def: ExerciseDef;
  id: string;
  name: string;
  sets: number;
  work: Work;
  load: ResolvedLoad;
  targetRPE: RPETarget | null;
  restSec: number;
  /** L'élément le plus visible de l'écran : « 5 × 3 × 115 kg ». */
  loadLine: string;
  notes: string[];
  /** S9-11 : l'explosif intercalé entre les séries. */
  contrast?: ContrastSpec;
  /** Paliers d'un test 1RM (§12). */
  ramp?: RampStep[];
  /**
   * Dernière charge réellement enregistrée sur cet exercice, ou `null`.
   *
   * Sert UNIQUEMENT à pré-remplir le champ de saisie, jamais la ligne de plan :
   * un mouvement au poids du corps ou sur poulie n'a pas de charge planifiée, et
   * le .md ne doit pas se voir attribuer un chiffre qu'il n'écrit pas.
   */
  lastKg: number | null;
  /**
   * Dernière mesure réellement enregistrée sur ce mouvement — distance d'un
   * saut, d'un porté, temps d'un sprint.
   *
   * Pendant du `lastKg`, et pour la même raison : le champ de saisie doit
   * s'ouvrir sur quelque chose de plausible. Il démarrait au minimum du
   * curseur, 5 m ou 50 cm, donc valider un porté sans y toucher enregistrait
   * 5 m au lieu de 30.
   *
   * On ne passe PAS par `lastCompleted` : ce champ vaut `false` sur un
   * mouvement mesuré, qui n'enregistre pas de reps. On prend la dernière
   * occurrence qui porte une mesure.
   */
  lastMeasure: number | null;
  /** §11 — proposition de charge, à accepter ou refuser. Jamais appliquée seule. */
  suggestion: ProgressionResult | null;
  adjustments: Adjustment[];
}

export interface ResolvedSession {
  week: WeekIndex;
  day: DayIndex;
  block: Block;
  blockName: string;
  blockColor: string;
  title: string;
  durationLabel: string;
  intensity: Intensity;
  warmup: Warmup | null;
  readinessTest: boolean;
  notes: string[];
  exercises: ResolvedExercise[];
  adjustments: Adjustment[];
}

/** Cette case du calendrier porte-t-elle une séance ? */
export function hasSession(week: WeekIndex, day: DayIndex): boolean {
  return (WEEK_DAYS[week] as readonly DayIndex[]).includes(day);
}

const LOWER_BODY_FN = new Set(['squat', 'hinge', 'jump', 'carry']);
const ONE_RM_FOR: Partial<Record<string, OneRMKey>> = {
  'back-squat': 'back-squat',
  'bench-press': 'bench-press',
  deadlift: 'deadlift',
  'weighted-pullup': 'weighted-pullup',
};

// ---------------------------------------------------------------------------

export function getSession(
  week: WeekIndex,
  day: DayIndex,
  ctx: SessionContext,
): ResolvedSession | null {
  if (!hasSession(week, day)) return null;

  const block = WEEK_BLOCKS[week];
  const special = specialSession(week, day);
  // `hasSession` a déjà écarté les jours vides ; si aucune trame ne répond ici,
  // c'est que `WEEK_DAYS` et `BASE_SESSIONS` se contredisent — on refuse plutôt
  // que d'afficher une séance inventée.
  const blueprint = special ?? BASE_SESSIONS[day];
  if (!blueprint) return null;
  const sessionAdjustments: Adjustment[] = [];

  // 1-2. Trame + règles de bloc (jamais sur une séance écrite en toutes lettres).
  let slots: Slot[] = blueprint.slots.map((s) => ({ ...s }));
  const notes = [...blueprint.notes];

  if (!special) {
    const before = slots.length;
    slots = applyBlockRules(slots, block, day);
    notes.push(...blockNotesFor(block, day));
    if (slots.length !== before) {
      sessionAdjustments.push({
        source: 'bloc',
        what: BLOCKS[block].name,
        why: `Séance adaptée au bloc « ${BLOCKS[block].name} » (§8).`,
      });
    }
  }

  // 3. Deload.
  const isDeload = block === 'deload' && !special;
  if (isDeload) {
    slots = slots.filter((s) => !DELOAD_POLICY.removeExIds.includes(s.exId as never));
    notes.push(...DELOAD_POLICY.notes);
    sessionAdjustments.push({
      source: 'deload',
      what: 'Semaine de deload',
      why: DELOAD_POLICY.notes[0]!,
    });
  }

  // 4-5. Résolution exercice par exercice.
  const contrast = block === 'power' && !special ? CONTRAST_BY_DAY[day] : undefined;
  const exercises: ResolvedExercise[] = [];

  for (const slot of slots) {
    const resolved = resolveSlot(slot, { week, block, isDeload, ctx, contrast });
    if (resolved) exercises.push(resolved);
  }

  // 6. Feu tricolore.
  const level = ctx.readiness?.level ?? 'vert';
  let finalExercises = exercises;
  if (level === 'orange') {
    finalExercises = applyOrange(exercises);
    sessionAdjustments.push({
      source: 'orange',
      what: 'Readiness ORANGE',
      why: '−5 % sur les gros mouvements, une série de moins sur les accessoires (§4).',
    });
  } else if (level === 'rouge') {
    finalExercises = applyRed(exercises, ctx);
    sessionAdjustments.push({
      source: 'rouge',
      what: 'Readiness ROUGE',
      why: 'Lift principal à 3 × 3 à 65 % du 1RM, tronc et mobilité, et tu rentres (§4).',
    });
    notes.push('Readiness rouge : aucune série au-dessus de RPE 8 aujourd’hui.');
  }

  // 7. Cas 7 — sauts en baisse deux semaines de suite.
  if (ctx.explosiveDecline && level !== 'rouge') {
    finalExercises = applyCase7(finalExercises);
    sessionAdjustments.push({
      source: 'cas7',
      what: 'Sauts en baisse',
      why: 'Lifts principaux ramenés à 3 séries, conditioning supprimé (§11 cas 7).',
    });
  }

  // Recalcule la ligne de charge après tous les ajustements.
  for (const ex of finalExercises) {
    ex.loadLine = formatLoadLine(ex.sets, ex.work, ex.load);
  }

  return {
    week,
    day,
    block,
    blockName: BLOCKS[block].name,
    blockColor: BLOCKS[block].color,
    title: blueprint.title,
    durationLabel: blueprint.durationLabel,
    intensity: blueprint.intensity,
    warmup: blueprint.warmup ? WARMUPS[blueprint.warmup] : null,
    readinessTest: blueprint.readinessTest,
    notes,
    exercises: finalExercises,
    adjustments: sessionAdjustments,
  };
}

// ---------------------------------------------------------------------------
// Règles de bloc
// ---------------------------------------------------------------------------

function applyBlockRules(slots: Slot[], block: Block, day: DayIndex): Slot[] {
  let out = slots;
  for (const rule of rulesFor(block, day)) {
    if (rule.op === 'remove') {
      out = out.filter((s) => s.exId !== rule.exId);
    } else if (rule.op === 'patch') {
      out = out.map((s) => (s.exId === rule.exId ? patchSlot(s, rule.patch) : s));
    } else {
      const slot = { ...rule.slot };
      if (rule.atStart) {
        out = [slot, ...out];
      } else if (rule.after) {
        const i = out.findIndex((s) => s.exId === rule.after);
        out = i === -1 ? [...out, slot] : [...out.slice(0, i + 1), slot, ...out.slice(i + 1)];
      } else {
        out = [...out, slot];
      }
    }
  }
  return out;
}

function patchSlot(slot: Slot, p: SlotPatch): Slot {
  return {
    ...slot,
    ...(p.sets !== undefined ? { sets: p.sets } : {}),
    ...(p.work !== undefined ? { work: p.work } : {}),
    ...(p.restSec !== undefined ? { restSec: p.restSec } : {}),
    ...(p.targetRPE !== undefined ? { targetRPE: p.targetRPE } : {}),
    ...(p.load !== undefined ? { load: p.load } : {}),
    ...(p.note !== undefined ? { note: p.note } : {}),
    // `loadFactor` et `contrastWith` sont consommés plus tard, on les mémorise.
    ...(p.loadFactor !== undefined ? { __loadFactor: p.loadFactor } : {}),
    ...(p.contrastWith !== undefined ? { __contrastWith: p.contrastWith } : {}),
  } as Slot;
}

// ---------------------------------------------------------------------------
// Résolution d'un exercice
// ---------------------------------------------------------------------------

interface ResolveOpts {
  week: WeekIndex;
  block: Block;
  isDeload: boolean;
  ctx: SessionContext;
  contrast: ContrastSpec | undefined;
}

function resolveSlot(slot: Slot, o: ResolveOpts): ResolvedExercise | null {
  const def = EXERCISES[slot.exId];
  if (!def) return null;

  const adjustments: Adjustment[] = [];
  const notes: string[] = [];
  if (slot.note) notes.push(slot.note);

  let sets = slot.sets;
  let work = slot.work;
  let targetRPE = slot.targetRPE;
  let loadSpec = slot.load;

  // 4. Tableau §9 pour les lifts principaux.
  if (slot.liftId) {
    // Les charges du tableau §9 sont des pourcentages d'un 1RM de référence.
    // On les recale sur les maxima réellement testés au combine — ne pas le
    // faire donnerait, avec un squat testé à 110, une semaine 1 à 91 % du max.
    const presc = prescriptionFor(slot.liftId, o.week);
    // Le mouvement n'est pas programmé cette semaine (front squat en S12).
    if (!presc) return null;
    sets = presc.sets;
    work = presc.work;
    targetRPE = presc.targetRPE;
    if (presc.load) loadSpec = presc.load;
    if (presc.note) notes.push(presc.note);
  }

  let load = resolveLoad(loadSpec, {
    settings: o.ctx.settings,
    history: o.ctx.history,
    exerciseId: slot.exId,
  });

  // « +10 % » des accessoires haut en force max (§8).
  const factor = (slot as Slot & { __loadFactor?: number }).__loadFactor;
  if (factor !== undefined && load.kg !== null) {
    const before = load.kg;
    load = scaleLoad(load, factor);
    adjustments.push({
      source: 'bloc',
      what: `${before} → ${load.kg} kg`,
      why: `Bloc force maximale : ${Math.round((factor - 1) * 100)} % sur les accessoires haut (§8).`,
    });
  }

  // 3. Deload — uniquement sur ce que le tableau ne chiffre pas déjà.
  if (o.isDeload && !slot.liftId) {
    if (def.role === 'accessory' && load.kg !== null) {
      const before = load.kg;
      load = scaleLoad(load, DELOAD_POLICY.accessoryLoadFactor);
      sets = DELOAD_POLICY.accessorySets;
      adjustments.push({
        source: 'deload',
        what: `${before} → ${load.kg} kg, ${sets} séries`,
        why: 'Deload : 80 % de ta dernière charge réelle, 2 séries (§8).',
      });
    } else if (def.role === 'accessory') {
      sets = DELOAD_POLICY.accessorySets;
    } else if (def.role === 'power') {
      const before = sets;
      sets = Math.max(1, Math.ceil(sets / DELOAD_POLICY.jumpVolumeDivisor));
      adjustments.push({
        source: 'deload',
        what: `${before} → ${sets} séries`,
        why: 'Deload : volume de sauts divisé par 2, intention maximale conservée (§8).',
      });
    }
    targetRPE = capRPE(targetRPE, DELOAD_POLICY.maxRPE);
  }

  // 5. Progression §11 — suggestion uniquement.
  const suggestion =
    load.kg === null
      ? null
      : applyProgression({
          history: o.ctx.history[slot.exId] ?? [],
          plannedKg: load.kg,
          targetRPE,
          step: load.step,
          isLowerBody: LOWER_BODY_FN.has(def.fn),
          ...(load.kgMax !== undefined ? { kgMax: load.kgMax } : {}),
        });

  if (suggestion?.capped) {
    adjustments.push({
      source: 'plafond',
      what: `${load.kgMax} kg`,
      why: 'Plafond assumé pour cet exercice sur ce bloc : le programme ne demande pas plus.',
    });
  }

  const contrastWith =
    (slot as Slot & { __contrastWith?: string }).__contrastWith ??
    (o.contrast?.heavy === slot.exId ? o.contrast.explosive : undefined);

  return {
    def,
    id: def.id,
    name: def.name,
    sets,
    work,
    load,
    targetRPE,
    restSec: slot.restSec,
    loadLine: formatLoadLine(sets, work, load),
    lastKg: lastCompleted(o.ctx.history[def.id] ?? [])?.kg ?? null,
    lastMeasure:
      [...(o.ctx.history[def.id] ?? [])].reverse().find((h) => h.measure != null)?.measure ?? null,
    notes,
    ...(contrastWith && o.contrast ? { contrast: o.contrast } : {}),
    ...(slot.ramp ? { ramp: slot.ramp } : {}),
    suggestion,
    adjustments,
  };
}

function capRPE(target: RPETarget | null, max: number): RPETarget | null {
  if (!target) return null;
  if (target.max <= max) return target;
  return { min: Math.min(target.min, max), max, label: `RPE ≤ ${String(max).replace('.', ',')}` };
}

// ---------------------------------------------------------------------------
// Feu tricolore
// ---------------------------------------------------------------------------

const BIG = new Set<string>(BIG_MOVEMENT_IDS);

function isBigMovement(ex: ResolvedExercise): boolean {
  return BIG.has(ex.id) || ex.def.role === 'main';
}

/** ORANGE — −5 % sur les gros mouvements, une série de moins sur les accessoires. */
function applyOrange(exercises: ResolvedExercise[]): ResolvedExercise[] {
  return exercises.map((ex) => {
    const out = { ...ex, adjustments: [...ex.adjustments] };

    if (isBigMovement(ex) && ex.load.kg !== null) {
      const before = ex.load.kg;
      out.load = scaleLoad(ex.load, READINESS_THRESHOLDS.orange.mainLoadFactor);
      out.adjustments.push({
        source: 'orange',
        what: `${before} → ${out.load.kg} kg`,
        why: 'Readiness orange : −5 % sur les gros mouvements (§4).',
      });
      if (ex.suggestion?.suggestedKg != null) {
        out.suggestion = {
          ...ex.suggestion,
          suggestedKg: roundToStep(
            ex.suggestion.suggestedKg * READINESS_THRESHOLDS.orange.mainLoadFactor,
            ex.load.step,
          ),
        };
      }
    }

    if (ex.def.role === 'accessory' && out.sets > 1) {
      const before = out.sets;
      out.sets = Math.max(1, out.sets + READINESS_THRESHOLDS.orange.accessorySetsDelta);
      out.adjustments.push({
        source: 'orange',
        what: `${before} → ${out.sets} séries`,
        why: 'Readiness orange : une série de moins sur les accessoires (§4).',
      });
    }

    return out;
  });
}

/**
 * ROUGE — « pas de travail RPE 8+. Technique à 65 % sur le lift principal
 * (3 × 3), tronc, mobilité, et tu rentres. »
 *
 * Tout ce qui est explosif disparaît : §5 interdit déjà de faire de la
 * puissance quand la performance est basse, et le readiness rouge dit
 * précisément ça.
 */
function applyRed(exercises: ResolvedExercise[], ctx: SessionContext): ResolvedExercise[] {
  const out: ResolvedExercise[] = [];

  for (const ex of exercises) {
    const rmKey = ONE_RM_FOR[ex.id];

    if (ex.def.role === 'main' && rmKey) {
      const oneRM = ctx.settings.oneRM[rmKey];
      const kg =
        oneRM === undefined
          ? null
          : roundToStep(oneRM * READINESS_THRESHOLDS.red.pctOf1RM, ex.load.step);
      out.push({
        ...ex,
        sets: READINESS_THRESHOLDS.red.sets,
        work: { kind: 'reps', reps: READINESS_THRESHOLDS.red.reps, perSide: false },
        load: withKg(ex.load, kg),
        targetRPE: null,
        suggestion: null,
        notes: [
          ...ex.notes,
          oneRM === undefined
            ? 'Renseigne ton 1RM dans les réglages pour que l’appli calcule les 65 %.'
            : `65 % de ton 1RM testé (${oneRM} kg). Technique et vitesse, rien d’autre.`,
        ],
        adjustments: [
          ...ex.adjustments,
          {
            source: 'rouge',
            what: `3 × 3 × ${kg ?? '—'} kg`,
            why: 'Readiness rouge : technique à 65 % du 1RM (§4).',
          },
        ],
      });
      continue;
    }

    // On garde le tronc et la mobilité, on retire tout le reste.
    if (ex.def.role === 'core' || ex.def.fn === 'mobility') {
      out.push(ex);
    }
  }

  return out;
}

/** §11 cas 7 — lifts principaux à 3 séries, suppression du conditioning. */
function applyCase7(exercises: ResolvedExercise[]): ResolvedExercise[] {
  return exercises
    .filter((ex) => ex.def.role !== 'conditioning')
    .map((ex) => {
      if (ex.def.role !== 'main' || ex.sets <= 3) return ex;
      return {
        ...ex,
        sets: 3,
        adjustments: [
          ...ex.adjustments,
          {
            source: 'cas7' as const,
            what: `${ex.sets} → 3 séries`,
            why: 'Tes sauts baissent depuis 2 semaines : §11 cas 7.',
          },
        ],
      };
    });
}
