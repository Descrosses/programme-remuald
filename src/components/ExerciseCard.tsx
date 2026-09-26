import { useEffect, useState } from 'react';
import type { SetRow } from '../db/db';
import { fr, gripHint, loadLine, restLabel } from '../engine/format';
import type { ResolvedExercise } from '../engine/getSession';
import type { RestTimer } from '../state/useRestTimer';
import { ExerciseMediaButton, type MediaContext } from './ExerciseMedia';
import { ExerciseNote, type NoteContext } from './ExerciseNote';
import { Stepper, stepValue } from './Stepper';
import { KG_MAX, KG_MIN, loadEntryFor, parseKg } from '../engine/loadEntry';
import { lastPerformance } from '../engine/lastPerformance';
import type { Occurrence } from '../engine/types';
import type { DayIndex } from '../data/types';
import styles from '../screens/Session.module.css';

export interface SetPayload {
  setIndex: number;
  actualKg: number | null;
  actualReps: number | null;
  actualRpe: number | null;
  measureValue: number | null;
  failed: boolean;
}

/**
 * Configuration du stepper de mesure pour les exercices qui ne comptent pas
 * des reps.
 *
 * Chrono au dixième : sur 10 ou 20 m, l'écart entre deux séances se joue à
 * 0,1 s. Et comme un chrono vidéo donne des centièmes, ces mesures acceptent
 * aussi la saisie clavier (appui sur la valeur) — contrairement aux reps, à la
 * charge et au RPE, où la grille du stepper est le bon outil.
 */
const MEASURE = {
  cm: { label: 'Distance', unit: 'cm', step: 5, min: 50, max: 400 },
  s: { label: 'Temps', unit: 's', step: 0.1, min: 0.5, max: 60 },
  m: { label: 'Distance', unit: 'm', step: 5, min: 5, max: 200 },
  kg: { label: 'Charge', unit: 'kg', step: 2.5, min: 0, max: 300 },
  reps: { label: 'Reps', unit: '', step: 1, min: 0, max: 60 },
} as const;

export function ExerciseCard({
  ex,
  savedSets,
  overrideKg,
  history,
  timer,
  media,
  note,
  onSaveSet,
  onOverride,
}: {
  ex: ResolvedExercise;
  savedSets: SetRow[];
  overrideKg: number | null;
  timer: RestTimer;
  /**
   * Les occurrences réelles de CET exercice, telles que §11 les lit. On ne
   * refait pas la requête : c'est la même matière, donc le même chiffre que
   * celui sur lequel la suggestion de charge est calculée.
   */
  history: Occurrence[] | undefined;
  /** Où l'on se trouve dans le programme, pour dater photos et traces vidéo. */
  media: MediaContext | null;
  /**
   * Semaine et jour de la séance. Séparé de `media` à dessein : les photos ont
   * besoin d'une date en base, la remarque non — elle se range sous (exercice,
   * semaine, jour). Les lier avait un effet de bord silencieux : tant que la
   * date de début du programme n'était pas réglée, `media` valait `null` et le
   * champ de remarque disparaissait de toutes les séances.
   */
  note: NoteContext;
  onSaveSet: (ex: ResolvedExercise, payload: SetPayload) => Promise<void>;
  onOverride: (exId: string, kg: number | null) => void;
}) {
  const [openCues, setOpenCues] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [manualKg, setManualKg] = useState<number>(ex.load.kg ?? 0);

  const plannedKg = overrideKg ?? ex.load.kg;
  const shownLoadLine = buildLoadLine(ex, plannedKg);
  const allDone = savedSets.length >= ex.sets && ex.sets > 0;
  const suggestion = ex.suggestion;
  const showSuggestion =
    suggestion?.requiresConfirm &&
    suggestion.suggestedKg !== null &&
    overrideKg === null &&
    savedSets.length === 0;

  return (
    <article className={`${styles.exercise} ${allDone ? styles.exerciseDone : ''}`}>
      <div className={styles.exHead}>
        <div className={styles.exName}>{ex.name}</div>
        <div className={`${styles.loadLine} tnum`}>{shownLoadLine}</div>

        <div className={styles.exSub}>
          {ex.targetRPE && <span>{ex.targetRPE.label}</span>}
          {ex.restSec > 0 && (
            <span>
              Repos <b>{restLabel(ex.restSec)}</b>
            </span>
          )}
          {overrideKg !== null && <span style={{ color: 'var(--accent)' }}>charge ajustée</span>}
        </div>

        {/*
          Le rappel « une ou deux haltères », juste sous la ligne de charge :
          l'endroit qu'on lit avant d'aller chercher le matériel. Deux portés
          du programme se ressemblent — Farmer à deux mains le vendredi,
          Suitcase à une main le samedi — et se confondent sans ça.
        */}
        {gripHint(ex.load) && <div className={styles.gripHint}>{gripHint(ex.load)}</div>}

        {ex.contrast && (
          <div className={styles.adjust}>
            <b>Contraste</b> — {ex.contrast.cycleLabel}. Série lourde →{' '}
            {restLabel(ex.contrast.restAfterHeavySec)} → {ex.contrast.explosive} ×{' '}
            {ex.contrast.explosiveReps} → {restLabel(ex.contrast.restAfterExplosiveSec)} → série
            suivante. Ce n’est pas un superset.
          </div>
        )}

        {ex.adjustments.map((a, i) => (
          <div
            key={i}
            className={`${styles.adjust} ${a.source === 'rouge' ? styles.adjustRouge : ''}`}
          >
            <b>{a.what}</b> — {a.why}
          </div>
        ))}

        {ex.notes.map((n, i) => (
          <div key={i} className={styles.exSub} style={{ color: 'var(--ink-2)' }}>
            {n}
          </div>
        ))}
      </div>

      <LastTime ex={ex} history={history} seance={{ week: note.week, day: note.day }} />

      {media && (
        <ExerciseMediaButton exerciseId={ex.id} exerciseName={ex.name} context={media} />
      )}

      {showSuggestion && (
        <div className={styles.suggestion}>
          <div className={styles.suggestionText}>{suggestion.reason}</div>
          {!refusing ? (
            <div className={styles.suggestionActions}>
              <button
                type="button"
                className={styles.accept}
                onClick={() => onOverride(ex.id, suggestion.suggestedKg)}
              >
                Accepter {fr(suggestion.suggestedKg!)} kg
              </button>
              <button
                type="button"
                className={styles.refuse}
                onClick={() => {
                  setManualKg(plannedKg ?? 0);
                  setRefusing(true);
                }}
              >
                Refuser
              </button>
            </div>
          ) : (
            <>
              <div className={styles.suggestionActions} style={{ marginTop: 12 }}>
                <Stepper
                  label="Ma charge"
                  value={manualKg}
                  step={ex.load.step}
                  min={0}
                  max={300}
                  unit="kg"
                  tone="accent"
                  onStep={(d) => setManualKg((v) => stepValue(v, d, 0, 300))}
                />
              </div>
              <div className={styles.suggestionActions}>
                <button
                  type="button"
                  className={styles.accept}
                  onClick={() => {
                    onOverride(ex.id, manualKg);
                    setRefusing(false);
                  }}
                >
                  Utiliser {fr(manualKg)} kg
                </button>
                <button type="button" className={styles.refuse} onClick={() => setRefusing(false)}>
                  Annuler
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {ex.ramp && (
        <div className={styles.adjust} style={{ margin: '0 var(--pad) 12px' }}>
          <b>Paliers</b> —{' '}
          {ex.ramp
            .map(
              (r) =>
                `${r.added ? '+' : ''}${fr(r.kg)}${r.reps > 1 ? `×${r.reps}` : ''}${r.optional ? ' ?' : ''}`,
            )
            .join(' / ')}
        </div>
      )}

      {ex.sets > 0 && (
        <div className={styles.sets}>
          {Array.from({ length: ex.sets }, (_, i) => (
            <SetEntry
              key={i}
              ex={ex}
              index={i}
              plannedKg={plannedKg}
              saved={savedSets.find((s) => s.setIndex === i) ?? null}
              timer={timer}
              onSave={onSaveSet}
            />
          ))}
        </div>
      )}

      {/* Remarque libre sur ce mouvement, sous les séries. Toujours là. */}
      <ExerciseNote exerciseId={ex.id} context={note} />

      {/*
        L'intention suffit à ouvrir le bloc. Avant, il fallait une consigne, une
        alternative ou une règle de progression : un exercice qui n'avait que
        son intention — Explosive Cable Row, One-Arm Cable Row, Cable Chop… —
        ne montrait donc RIEN, alors que le .md écrit bien quelque chose sur lui.
      */}
      {(ex.def.intent || ex.def.cues?.length || ex.def.altBasicFit || ex.def.progressionRule) && (
        <>
          <button
            type="button"
            className={styles.disclosure}
            onClick={() => setOpenCues((v) => !v)}
            aria-expanded={openCues}
          >
            {openCues
              ? '▲ Masquer les consignes'
              : ex.def.altBasicFit
                ? '▼ Consignes et alternative Basic-Fit'
                : '▼ Consignes'}
          </button>
          {openCues && (
            <div className={styles.cues}>
              {ex.def.intent && (
                <p>
                  <b>Intention :</b> {ex.def.intent}
                </p>
              )}
              {ex.def.cues?.map((c, i) => <p key={i}>{c}</p>)}
              {ex.def.progressionRule && (
                <p>
                  <b>Progression :</b> {ex.def.progressionRule}
                </p>
              )}
              {ex.def.altBasicFit && (
                <p>
                  <b>Alternative Basic-Fit :</b> {ex.def.altBasicFit}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------

/**
 * « La dernière fois : tant. »
 *
 * Entre la ligne de charge prévue et les champs de saisie — à l'endroit exact
 * où la question se pose, juste avant de charger la barre. Sans ça il fallait
 * quitter la séance pour l'onglet Progrès, ce que personne ne fait entre deux
 * séries.
 *
 * Rien à la première occurrence d'un mouvement, plutôt qu'un encart vide : en
 * semaine 1, neuf exercices afficheraient neuf lignes identiques sans
 * information, qui repousseraient les champs de saisie hors de l'écran. Un
 * encart qui ne dit rien vaut moins que pas d'encart.
 */
function LastTime({
  ex,
  history,
  seance,
}: {
  ex: ResolvedExercise;
  history: Occurrence[] | undefined;
  seance: { week: number; day: DayIndex };
}) {
  const perf = lastPerformance(history, {
    exerciseId: ex.id,
    measureUnit: measureOf(ex)?.unit ?? null,
    before: seance,
  });
  if (perf === null) return null;

  /*
   * `down` n'a pas de classe à lui : une semaine de deload EST une baisse de
   * charge, un ajustement orange aussi. Les peindre en rouge apprendrait à
   * Guillaume à ignorer la couleur le jour où elle compte vraiment.
   */
  const fleche = perf.trend === 'up' ? '↑' : perf.delta === null ? '—' : '';

  return (
    <div className={styles.lastTime}>
      <span className={styles.lastTimeWhen}>📊 Semaine {perf.week}</span>
      <span className={`${styles.lastTimeValue} tnum`}>{perf.value}</span>
      {perf.rpe && <span className={styles.lastTimeRpe}>{perf.rpe}</span>}
      {(perf.delta || fleche) && (
        <span
          className={`${styles.lastTimeDelta} ${perf.trend === 'up' ? styles.lastTimeUp : ''} tnum`}
        >
          {fleche}
          {fleche && perf.delta ? ' ' : ''}
          {perf.delta}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SetEntry({
  ex,
  index,
  plannedKg,
  saved,
  timer,
  onSave,
}: {
  ex: ResolvedExercise;
  index: number;
  plannedKg: number | null;
  saved: SetRow | null;
  timer: RestTimer;
  onSave: (ex: ResolvedExercise, payload: SetPayload) => Promise<void>;
}) {
  const plannedReps = plannedRepsOf(ex);
  const measure = measureOf(ex);
  const showLoad = showsLoadField(ex);

  const [editing, setEditing] = useState(false);
  const [reps, setReps] = useState<number>(saved?.actualReps ?? plannedReps ?? 1);
  /*
   * Le champ de charge existe sur TOUS les exercices, y compris au poids du
   * corps — il sert alors à noter un lest. Sa valeur de départ et son pas sont
   * décidés dans l'engine (`loadEntryFor`), pas ici : c'est ce qui les rend
   * testables sans monter un rendu React.
   *
   * `null` et non 0 : un « 0 kg » affiché ressemble à une charge prescrite,
   * alors que le programme n'en donne aucune sur ces mouvements-là.
   */
  const entry = loadEntryFor(ex, saved?.actualKg ?? (plannedKg ?? undefined));
  const [kg, setKg] = useState<number | null>(entry.initialKg);
  const [rpeValue, setRpe] = useState<number>(saved?.actualRpe ?? ex.targetRPE?.max ?? 7);
  /*
   * Le champ de mesure s'ouvre sur ce qui a le plus de chances d'être juste,
   * dans cet ordre : ce qui a déjà été saisi pour cette série, la valeur que
   * le plan prescrit, la dernière réellement faite, et seulement en dernier
   * recours le minimum du curseur.
   *
   * Il démarrait au minimum. Valider un Suitcase Carry sans toucher au
   * curseur enregistrait donc 5 m au lieu des 30 m du plan — et l'encart de
   * comparaison répétait ensuite ce 5 m semaine après semaine.
   */
  const [value, setValue] = useState<number>(
    saved?.measureValue ?? plannedMeasureOf(ex) ?? ex.lastMeasure ?? measure?.min ?? 0,
  );
  const [failed, setFailed] = useState<boolean>(saved?.failed ?? false);

  // Quand la charge du plan change — suggestion acceptée, feu tricolore, charge
  // saisie à la main — les séries pas encore validées se réalignent dessus.
  useEffect(() => {
    if (saved === null && plannedKg !== null) setKg(plannedKg);
  }, [plannedKg, saved]);


  const done = saved !== null && !editing;

  async function validate() {
    timer.prime();
    await onSave(ex, {
      setIndex: index,
      /*
       * Pas de champ, pas de charge : sans ça un saut hériterait de la dernière
       * charge connue et la traînerait dans l'historique.
       */
      actualKg: showLoad ? kg : null,
      actualReps: measure ? null : reps,
      actualRpe: ex.targetRPE ? rpeValue : null,
      measureValue: measure ? value : null,
      failed,
    });
    setEditing(false);
    if (ex.restSec > 0) {
      const label = ex.contrast
        ? `→ ${ex.contrast.explosive} × ${ex.contrast.explosiveReps}`
        : `${ex.name} — série ${index + 1}`;
      timer.start(ex.contrast?.restAfterHeavySec ?? ex.restSec, label);
    }
  }

  if (done) {
    return (
      <div className={`${styles.setRow} ${styles.setDone}`}>
        <div className={styles.setIndex}>{index + 1}</div>
        <button type="button" className={styles.setSummary} onClick={() => setEditing(true)}>
          {saved.actualReps !== null && (
            <span className={`${styles.setSummaryValue} tnum`}>
              {saved.actualReps} <span className={styles.setSummaryUnit}>reps</span>
            </span>
          )}
          {saved.measureValue !== null && measure && (
            <span className={`${styles.setSummaryValue} tnum`}>
              {fr(saved.measureValue)} <span className={styles.setSummaryUnit}>{measure.unit}</span>
            </span>
          )}
          {saved.actualKg !== null && (
            <span className={`${styles.setSummaryValue} tnum`}>
              {fr(saved.actualKg)} <span className={styles.setSummaryUnit}>kg</span>
            </span>
          )}
          {saved.actualRpe !== null && (
            <span className={`${styles.setSummaryValue} tnum`}>
              {fr(saved.actualRpe)} <span className={styles.setSummaryUnit}>RPE</span>
            </span>
          )}
          {saved.failed && <span className={styles.failFlag}>Rep ratée</span>}
        </button>
      </div>
    );
  }

  // Trois champs au maximum — reps/mesure, charge, RPE. Dès qu'il y en a un
  // nombre impair, le dernier prend toute la largeur pour que les boutons
  // gardent leurs 48 px.
  const hasRpe = ex.targetRPE !== null;
  const count = (showLoad ? 2 : 1) + (hasRpe ? 1 : 0);
  const wide = (position: number) => (count % 2 === 1 && position === count ? styles.stepperWide : '');

  return (
    <div className={styles.setRow}>
      <div className={styles.setIndex}>{index + 1}</div>
      <div className={styles.fields}>
        <div className={styles.steppers}>
          <div className={wide(1)}>
            {measure ? (
              <Stepper
                label={measure.label}
                value={value}
                step={measure.step}
                min={measure.min}
                max={measure.max}
                unit={measure.unit}
                tone="accent"
                onStep={(d) => setValue((v) => stepValue(v, d, measure.min, measure.max))}
                onCommit={(v) => setValue(v ?? measure.min)}
              />
            ) : (
              <Stepper
                label="Reps"
                value={reps}
                step={1}
                min={0}
                max={60}
                onStep={(d) => setReps((v) => stepValue(v, d, 0, 60))}
              />
            )}
          </div>

          {showLoad && (
            <div className={wide(2)}>
              <Stepper
                label={ex.load.shape === 'added' ? 'Lest' : 'Charge'}
                value={kg}
                emptyLabel={entry.emptyLabel}
                step={entry.step}
                min={KG_MIN}
                max={KG_MAX}
                unit="kg"
                onStep={(d) => setKg((v) => stepValue(v ?? 0, d, KG_MIN, KG_MAX))}
                /*
                 * `onCommit` ouvre le pavé numérique sur la valeur. Le Stepper
                 * rend la chaîne brute : c'est `parseKg` qui décide, et sa règle
                 * est « en cas de doute, on garde ce qu'il y avait ». Une faute
                 * de frappe ne doit jamais écrire un NaN ni un 0 dans
                 * l'historique — un 0 passerait pour une série faite à vide.
                 */
                onCommitText={(brut: string) => setKg((v) => parseKg(brut, v))}
              />
            </div>
          )}

          {hasRpe && (
            <div className={wide(count)}>
              <Stepper
                label="RPE"
                value={rpeValue}
                step={0.5}
                min={4}
                max={10}
                onStep={(d) => setRpe((v) => stepValue(v, d, 4, 10))}
              />
            </div>
          )}
        </div>

        {ex.def.role === 'main' && (
          <button
            type="button"
            className={`${styles.failToggle} ${failed ? styles.failToggleOn : ''}`}
            onClick={() => setFailed((f) => !f)}
            aria-pressed={failed}
          >
            {failed ? '✓ Rep ratée' : 'Rep ratée ?'}
          </button>
        )}

        <button type="button" className={styles.validate} onClick={() => void validate()}>
          Valider la série {index + 1}
        </button>

        {ex.contrast && (
          <button
            type="button"
            className={styles.failToggle}
            onClick={() =>
              timer.start(
                ex.contrast!.restAfterExplosiveSec,
                `${ex.contrast!.explosive} fait → série suivante`,
              )
            }
          >
            {ex.contrast.explosive} × {ex.contrast.explosiveReps} fait
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * La mesure que le programme prescrit, quand il en prescrit une.
 *
 * Les portés sont chiffrés en mètres par le plan (« 4 × 25 m »), donc la
 * valeur existe. Un saut, non : le programme ne dit pas à quelle distance
 * sauter, c'est la mesure du jour. D'où le repli sur la dernière réalisée.
 */
function plannedMeasureOf(ex: ResolvedExercise): number | null {
  return ex.work.kind === 'distance' ? ex.work.meters : null;
}

function plannedRepsOf(ex: ResolvedExercise): number | null {
  if (ex.work.kind !== 'reps') return null;
  const r = ex.work.reps;
  if (r === 'max') return null;
  return typeof r === 'number' ? r : r.max;
}

/**
 * Mesures qui remplacent le compte de reps : une distance, un temps.
 *
 * `kg` n'en fait pas partie — une charge se note dans le champ de charge, pas
 * une deuxième fois à côté.
 */
const MESURE_CHIFFREE = new Set(['cm', 'm', 's']);

export function measureOf(ex: ResolvedExercise): (typeof MEASURE)[keyof typeof MEASURE] | null {
  if (ex.work.kind === 'distance') return MEASURE.m;
  /*
   * Un saut se note par sa distance, et pas seulement en semaine de combine.
   * Un « 5 × 2 » de Broad Jump sans champ de distance ne garde rien de la
   * séance : c'est le seul chiffre qui progresse d'une semaine à l'autre.
   */
  const m = ex.def.measure;
  if (m && MESURE_CHIFFREE.has(m)) return MEASURE[m];
  if (ex.def.role !== 'test') return null;
  return m ? MEASURE[m] : MEASURE.reps;
}

/**
 * Le champ de charge a-t-il un sens sur cet exercice ?
 *
 * Il est là partout ailleurs, y compris au poids du corps, où il sert à noter
 * un lest. Mais sur un saut ou un sprint il n'y a rien à lester et rien à
 * porter : « PDC » y prend la moitié de la ligne pour ne jamais rien dire,
 * alors que la distance, elle, est la seule valeur de la séance.
 *
 * Un porté garde ses deux champs : sa charge existe (`shape` vaut `dbPair`) et
 * sa distance aussi.
 */
export function showsLoadField(ex: ResolvedExercise): boolean {
  if (ex.load.shape !== 'none') return true;
  const m = ex.def.measure;
  return !(m !== undefined && MESURE_CHIFFREE.has(m));
}

/** Reprend la ligne de charge en tenant compte d'une charge ajustée. */
function buildLoadLine(ex: ResolvedExercise, kg: number | null): string {
  if (kg === null || kg === ex.load.kg) return ex.loadLine;
  return loadLine(ex.sets, ex.work, { ...ex.load, kg });
}
