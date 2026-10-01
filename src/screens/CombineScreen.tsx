import { useEffect, useState } from 'react';
import { Stepper, stepValue } from '../components/Stepper';
import { EXERCISES } from '../data/exercises';
import {
  COMBINE_METRICS,
  COMBINE_S8_METRICS,
  RAMPS,
  RAMPS_S12,
  TARGETS_12_WEEKS,
} from '../data/testSessions';
import { fr } from '../engine/format';
import { allCombines, getSettingsRow, saveCombine } from '../db/repo';
import type { CombinePhase, CombineRow } from '../db/db';
import styles from './Screens.module.css';

const PHASES: Array<{ id: CombinePhase; label: string; when: string }> = [
  { id: 'initial', label: 'Initial', when: 'Semaine 0' },
  { id: 's8', label: 'Intermédiaire', when: 'Semaine 8' },
  { id: 'final', label: 'Final', when: 'Semaine 12' },
];

/**
 * Réglages du stepper par unité de mesure.
 *
 * Le pas du chrono est de 0,1 s : sur un 10 m, deux séances peuvent se jouer à
 * un dixième, et un pas plus gros effacerait le progrès qu'on cherche à voir.
 * Pour un temps relevé à la vidéo au centième, la saisie clavier prend le
 * relais — chaque mesure de cet écran l'accepte.
 */
const MEASURE = {
  cm: { step: 1, min: 50, max: 250, unit: 'cm' },
  s: { step: 5, min: 0, max: 600, unit: 's' },
  m: { step: 10, min: 5, max: 20000, unit: 'm' },
  kg: { step: 2.5, min: 0, max: 300, unit: 'kg' },
  reps: { step: 1, min: 0, max: 60, unit: 'reps' },
} as const;

/**
 * De la mesure du combine vers la colonne du tableau de charges.
 *
 * La correspondance est écrite, pas déduite : « test-squat-1rm » donnait
 * « squat » en retirant les affixes, alors que la colonne s'appelle
 * « back-squat ». Les paliers du squat et du bench ne s'affichaient donc
 * jamais — sans erreur, juste rien.
 */
const RAMP_KEY: Record<string, string | undefined> = {};

/** Poids et tour de taille : plus bas = mieux, la flèche s'inverse. */
const LOWER_IS_BETTER = new Set(['test-bodyweight', 'test-waist']);

export function CombineScreen() {
  const [rows, setRows] = useState<CombineRow[] | null>(null);
  const [phase, setPhase] = useState<CombinePhase>('initial');
  const [draft, setDraft] = useState<Record<string, number | null>>({});
  /** Poids de corps des Réglages : il ne se mesure pas en salle (§12). */
  const [settingsBodyweight, setSettingsBodyweight] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      setRows(await allCombines());
      setSettingsBodyweight((await getSettingsRow()).bodyweightKg);
    })();
  }, []);

  useEffect(() => {
    if (!rows) return;
    setDraft(rows.find((r) => r.phase === phase)?.metrics ?? {});
  }, [rows, phase]);

  if (!rows) return <div className={styles.loading}>Chargement…</div>;

  const metrics = phase === 's8' ? COMBINE_S8_METRICS : COMBINE_METRICS;
  const byPhase = (p: CombinePhase) => rows.find((r) => r.phase === p)?.metrics ?? {};

  async function save() {
    await saveCombine(phase, { metrics: draft, date: new Date().toISOString().slice(0, 10) });
    setRows(await allCombines());
  }

  // L'indicateur clé de Remuald : le poids perdu depuis le bilan initial.
  const poids = (p: CombinePhase) => {
    const v = byPhase(p)['test-bodyweight'];
    return typeof v === 'number' ? v : null;
  };
  const poidsInitial = poids('initial');
  const poidsDernier = poids('final') ?? poids('s8');
  const gapNow =
    poidsInitial !== null && poidsDernier !== null
      ? Math.round((poidsDernier - poidsInitial) * 10) / 10
      : null;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Combine</h1>
        <p className={styles.lead}>
          Même lieu, mêmes chaussures, même protocole, idéalement même heure. C’est ce qui rend les
          trois combines comparables.
        </p>
      </header>

      <div className={styles.weeks}>
        {PHASES.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`${styles.week} ${phase === p.id ? styles.weekOn : ''}`}
            style={{ width: 'auto', padding: '0 14px', borderBottomColor: 'var(--bloc-test)' }}
            onClick={() => setPhase(p.id)}
            aria-pressed={phase === p.id}
          >
            <span className={styles.weekNum} style={{ fontSize: '1rem' }}>
              {p.label}
            </span>
            <span className={styles.weekTag}>{p.when}</span>
          </button>
        ))}
      </div>

      {/* --- L'indicateur clé du programme -------------------------------- */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Poids depuis le bilan initial</h2>
        <p className={styles.cardSub}>
          L’indicateur clé, à lire avec le tour de taille et des charges qui montent. Rythme visé :
          −0,5 à −1 kg par semaine.
        </p>
        <div className={styles.keyStat}>
          <div
            className={styles.keyStatValue}
            style={{ color: gapNow === null ? 'var(--ink-3)' : gapNow < 0 ? 'var(--vert)' : 'var(--orange)' }}
          >
            {gapNow === null ? '—' : `${gapNow > 0 ? '+' : ''}${fr(gapNow)} kg`}
          </div>
          <div className={styles.keyStatLabel}>
            {poidsInitial === null
              ? 'Saisis le poids du bilan initial pour le calculer.'
              : poidsDernier === null
                ? `Bilan initial : ${fr(poidsInitial)} kg. Saisis le bilan suivant pour voir l’écart.`
                : `Bilan initial ${fr(poidsInitial)} kg, dernier bilan ${fr(poidsDernier)} kg.`}
          </div>
        </div>
      </section>

      {/* --- Comparaison des trois combines -------------------------------- */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Comparaison</h2>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Mesure</th>
                <th>Initial</th>
                <th>S8</th>
                <th>Final</th>
                <th>Cible</th>
              </tr>
            </thead>
            <tbody>
              {COMBINE_METRICS.map((id) => {
                const i = byPhase('initial')[id];
                const s = byPhase('s8')[id];
                const f = byPhase('final')[id];
                const better =
                  typeof i === 'number' && typeof f === 'number'
                    ? LOWER_IS_BETTER.has(id)
                      ? f < i
                      : f > i
                    : null;
                return (
                  <tr key={id}>
                    <td>{EXERCISES[id]?.name ?? id}</td>
                    <td>{typeof i === 'number' ? fr(i) : '—'}</td>
                    <td>{typeof s === 'number' ? fr(s) : '—'}</td>
                    <td
                      className={
                        better === null ? '' : better ? styles.deltaUp : styles.deltaDown
                      }
                    >
                      {typeof f === 'number' ? fr(f) : '—'}
                    </td>
                    <td style={{ color: 'var(--ink-3)', fontWeight: 500 }}>
                      {TARGETS_12_WEEKS[id]?.target ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- Saisie guidée -------------------------------------------------- */}
      <h2 className={styles.sectionTitle}>
        Saisie — combine {PHASES.find((p) => p.id === phase)!.label.toLowerCase()}
      </h2>
      {phase === 's8' && (
        <p className={styles.hint}>Mêmes tests qu’au bilan initial, même ordre, même matériel.</p>
      )}

      {metrics.map((id) => {
        const def = EXERCISES[id];
        if (!def) return null;
        const cfg = MEASURE[def.measure ?? 'reps'];
        /*
         * Les paliers du test final ne sont pas ceux du test initial : ils sont
         * calculés sur les maxima mesurés ce jour-là. Montrer ceux du §12 en
         * semaine 12 ferait monter le squat à 130 pour un 1RM de 110.
         */
        const cle = RAMP_KEY[id];
        const ramp = cle ? (phase === 'final' ? RAMPS_S12 : RAMPS)[cle] : undefined;
        return (
          <section key={id} className={styles.card}>
            <h3 className={styles.cardTitle}>{def.name}</h3>
            <p className={styles.cardSub}>{def.intent}</p>
            {ramp && (
              <p className={styles.fieldHint}>
                <b>Paliers :</b>{' '}
                {ramp
                  .map(
                    (r) =>
                      `${r.added ? '+' : ''}${fr(r.kg)}${r.reps > 1 ? `×${r.reps}` : ''}${
                        r.optional ? ' ?' : ''
                      }`,
                  )
                  .join(' / ')}
              </p>
            )}
            {id === 'test-bodyweight' && (
              <p className={styles.fieldHint}>
                Relevé à la maison, pas en salle : moyenne de 3 matins à jeun. Il se saisit aussi
                dans Réglages, à n’importe quel moment.
              </p>
            )}
            <div style={{ marginTop: 12 }}>
              <Stepper
                label={def.name}
                value={draft[id] ?? null}
                step={cfg.step}
                min={cfg.min}
                max={cfg.max}
                unit={cfg.unit}
                tone="accent"
                onStep={(d) =>
                  setDraft((prev) => ({
                    ...prev,
                    [id]: stepValue(prev[id] ?? null, d, cfg.min, cfg.max),
                  }))
                }
                onCommit={(v) => setDraft((prev) => ({ ...prev, [id]: v }))}
              />
            </div>
            {id === 'test-bodyweight' &&
              settingsBodyweight !== null &&
              draft[id] !== settingsBodyweight && (
                <button
                  type="button"
                  className={styles.secondary}
                  style={{ width: '100%', margin: '10px 0 0' }}
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, [id]: settingsBodyweight }))
                  }
                >
                  Reprendre {fr(settingsBodyweight)} kg des Réglages
                </button>
              )}
          </section>
        );
      })}

      <button type="button" className={styles.primary} onClick={() => void save()}>
        Enregistrer le combine
      </button>
    </div>
  );
}
