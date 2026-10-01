import { useEffect, useMemo, useState } from 'react';
import { BarChart, LineChart, type Series } from '../components/Chart';
import { VisualTracking } from '../components/VisualTracking';
import { EXERCISES } from '../data/exercises';
import { DAY_LABELS_SHORT } from '../data/types';
import { fr } from '../engine/format';
import type { HistoryIndex } from '../engine/types';
import { allSets, buildHistoryIndex } from '../db/repo';
import type { SetRow } from '../db/db';
import styles from './Screens.module.css';

/** Les exercices principaux du programme Remuald. */
const LIFTS: Array<{ id: string; label: string }> = [
  { id: 'goblet-squat', label: 'Goblet' },
  { id: 'back-squat', label: 'Squat' },
  { id: 'bench-press', label: 'Couché' },
  { id: 'lat-pulldown', label: 'Tirage' },
  { id: 'rdl', label: 'RDL' },
  { id: 'hip-thrust', label: 'Hip Thrust' },
];

/**
 * L'écran répond à une seule question — « est-ce que ça bouge ? » — par deux
 * moyens : les chiffres et l'œil. Un sélecteur en haut plutôt que six sections
 * empilées : les courbes se consultent le soir, les photos une fois par
 * semaine, on ne veut pas faire défiler les unes pour atteindre les autres.
 */
type Vue = 'chiffres' | 'photos';

export function ProgressScreen() {
  const [vue, setVue] = useState<Vue>('chiffres');
  const [data, setData] = useState<{ history: HistoryIndex; sets: SetRow[] } | null>(null);
  const [lift, setLift] = useState<string>('bench-press');

  useEffect(() => {
    void (async () => {
      const sets = await allSets();
      setData({ history: buildHistoryIndex(sets), sets });
    })();
  }, []);

  const realPoints = useMemo(
    () =>
      (data?.history[lift] ?? [])
        .filter((o) => o.kg !== null)
        .map((o) => ({ x: o.week, y: o.kg! })),
    [data, lift],
  );

  if (!data) return <div className={styles.loading}>Chargement…</div>;

  // --- charge réelle, semaine par semaine -----------------------------------
  // Pas de courbe « plan » : les charges de Remuald se règlent au RPE.
  const liftSeries: Series[] = [{ label: 'Réel', color: 'var(--accent)', points: realPoints }];

  // --- RPE moyen par séance -------------------------------------------------
  const bySession = new Map<string, { sum: number; n: number; week: number; day: number }>();
  for (const s of data.sets) {
    if (s.actualRpe === null) continue;
    const key = `${s.week}-${s.day}`;
    const cur = bySession.get(key) ?? { sum: 0, n: 0, week: s.week, day: s.day };
    cur.sum += s.actualRpe;
    cur.n += 1;
    bySession.set(key, cur);
  }
  const rpeBars = [...bySession.values()]
    .sort((a, b) => a.week - b.week || a.day - b.day)
    .slice(-12)
    .map((v) => ({
      label: `${v.week}${DAY_LABELS_SHORT[v.day as 0 | 1 | 2 | 3 | 4][0]}`,
      value: Math.round((v.sum / v.n) * 10) / 10,
      color: v.sum / v.n >= 9 ? 'var(--rouge)' : 'var(--accent)',
    }));

  const weeksX = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [i + 1, i % 2 === 0 ? `S${i + 1}` : '']),
  );

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Progression</h1>
        <p className={styles.lead}>
          {vue === 'chiffres'
            ? 'Ce que tu as réellement soulevé, semaine après semaine.'
            : 'Une photo par semaine. Ce que les courbes ne montrent pas.'}
        </p>
      </header>

      <div className={styles.segment} role="group" aria-label="Vue">
        {(
          [
            ['chiffres', 'Chiffres'],
            ['photos', 'Suivi visuel'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`${styles.segmentButton} ${vue === id ? styles.segmentOn : ''}`}
            onClick={() => setVue(id)}
            aria-pressed={vue === id}
          >
            {label}
          </button>
        ))}
      </div>

      {vue === 'photos' && <VisualTracking />}

      {vue === 'chiffres' && (
        <>
      <div className={styles.weeks}>
        {LIFTS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`${styles.week} ${lift === l.id ? styles.weekOn : ''}`}
            style={{ width: 'auto', padding: '0 14px', borderBottomColor: 'var(--accent)' }}
            onClick={() => setLift(l.id)}
            aria-pressed={lift === l.id}
          >
            <span className={styles.weekNum} style={{ fontSize: '1rem' }}>
              {l.label}
            </span>
          </button>
        ))}
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{EXERCISES[lift]?.name} — charge par semaine</h2>
        <p className={styles.cardSub}>
          {realPoints.length === 0
            ? 'Rien d’enregistré pour l’instant.'
            : `Dernière charge travaillée : ${fr(realPoints[realPoints.length - 1]!.y)} kg.`}
        </p>
        <LineChart
          series={liftSeries}
          xLabels={weeksX}
          unit="kg"
          emptyMessage="Valide des séries pour voir la courbe apparaître."
        />
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>RPE moyen par séance</h2>
        <p className={styles.cardSub}>
          Les 12 dernières séances. Une barre rouge signale une séance encaissée à 9 ou plus.
        </p>
        <BarChart bars={rpeBars} emptyMessage="Aucun RPE saisi pour l’instant." />
      </section>
        </>
      )}
    </div>
  );
}
