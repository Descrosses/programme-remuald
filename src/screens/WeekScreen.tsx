import { useEffect, useState } from 'react';
import { BLOCKS, WEEK_BLOCKS, WEEK_DAYS } from '../data/program';
import { DAY_LABELS, DAY_LABELS_SHORT, type DayIndex, type WeekIndex } from '../data/types';
import { dateFor, humanDate } from '../engine/calendar';
import { getSession } from '../engine/getSession';
import {
  allReadiness,
  allSessions,
  allSets,
  buildHistoryIndex,
  getSettingsRow,
  toEngineSettings,
  toReadinessRecords,
} from '../db/repo';
import { explosiveTrend } from '../engine/trends';
import type { SessionRow } from '../db/db';
import styles from './Screens.module.css';

interface DayLine {
  day: DayIndex;
  title: string;
  intensity: string;
  duration: string;
  date: string;
  status: SessionRow['status'];
  isToday: boolean;
}

/** Vue de la semaine : les 5 jours, leur état, et le bloc en cours. */
export function WeekScreen({
  week,
  onChangeWeek,
  onOpen,
  onGoNutrition,
}: {
  week: WeekIndex;
  onChangeWeek: (week: WeekIndex) => void;
  onOpen: (week: WeekIndex, day: DayIndex) => void;
  onGoNutrition: () => void;
}) {
  const [lines, setLines] = useState<DayLine[] | null>(null);

  useEffect(() => {
    void (async () => {
      const settingsRow = await getSettingsRow();
      const settings = toEngineSettings(settingsRow);
      const [sets, readinessRows, rows] = await Promise.all([
        allSets(),
        allReadiness(),
        allSessions(),
      ]);
      const history = buildHistoryIndex(sets);
      const trend = explosiveTrend(toReadinessRecords(readinessRows));
      const todayIso = new Date().toISOString().slice(0, 10);

      const out: DayLine[] = [];
      for (const day of WEEK_DAYS[week]) {
        const s = getSession(week, day, {
          settings,
          history,
          readiness: null,
          explosiveDecline: trend.declining,
        });
        if (!s) continue;
        const date = settings.startDate ? dateFor(settings.startDate, week, day) : '';
        out.push({
          day,
          title: s.title,
          intensity: s.intensity,
          duration: s.durationLabel,
          date,
          status: rows.find((r) => r.week === week && r.day === day)?.status ?? 'planned',
          isToday: date === todayIso,
        });
      }
      setLines(out);
    })();
  }, [week]);

  const block = BLOCKS[WEEK_BLOCKS[week]];

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.h1}>{week === 0 ? 'Bilan initial' : `Semaine ${week}`}</h1>
        <p className={styles.lead}>
          {week === 0 &&
            'Bilan initial sur trois jours, sans charge maximale ni saut : il sert de point de départ pour mesurer tes progrès.'}
          {week === 1 &&
            'Première semaine complète, quatre séances. La technique passe avant la charge.'}
          {week > 1 && block.objective}
        </p>
      </header>

      {/* Sélecteur de semaines, colorié par bloc — la périodisation se lit d'un coup d'œil. */}
      <div className={styles.weeks}>
        {Array.from({ length: 13 }, (_, w) => {
          const b = BLOCKS[WEEK_BLOCKS[w as WeekIndex]];
          return (
            <button
              key={w}
              type="button"
              className={`${styles.week} ${w === week ? styles.weekOn : ''}`}
              style={{ borderBottomColor: b.color }}
              onClick={() => onChangeWeek(w as WeekIndex)}
              aria-current={w === week ? 'true' : undefined}
            >
              <span className={styles.weekNum}>{w === 0 ? 'T' : w}</span>
              <span className={styles.weekTag} style={{ color: b.color }}>
                {b.short}
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.blockBar} style={{ borderLeftColor: block.color }}>
        <div>
          <div className={styles.blockName}>{block.name}</div>
          <div className={styles.blockMeta}>
            {block.intensityLabel} · {block.objective}
          </div>
        </div>
      </div>

      {lines === null ? (
        <div className={styles.loading}>Chargement…</div>
      ) : (
        <div className={styles.cardFlush}>
          {lines.map((l) => (
            <button
              key={l.day}
              type="button"
              className={styles.dayRow}
              onClick={() => onOpen(week, l.day)}
            >
              <span className={styles.dayName}>{DAY_LABELS_SHORT[l.day]}</span>
              <span className={styles.dayBody}>
                <span className={styles.dayTitle}>{l.title}</span>
                <span className={styles.dayMeta}>
                  {l.intensity} · {l.duration}
                  {l.date && ` · ${humanDate(l.date)}`}
                </span>
              </span>
              <span
                className={`${styles.status} ${
                  l.status === 'done'
                    ? styles.statusDone
                    : l.status === 'skipped'
                      ? styles.statusSkipped
                      : l.isToday
                        ? styles.statusToday
                        : styles.statusTodo
                }`}
              >
                {l.status === 'done'
                  ? 'Faite'
                  : l.status === 'skipped'
                    ? 'Sautée'
                    : l.isToday
                      ? 'Aujourd’hui'
                      : 'À faire'}
              </span>
              <span className="visually-hidden">Ouvrir la séance du {DAY_LABELS[l.day]}</span>
            </button>
          ))}
        </div>
      )}

      {/*
        Un lien, pas un sous-onglet. La diet ne change pas d'une semaine à
        l'autre : la recopier dans chacun des treize écrans Semaine afficherait
        treize fois la même chose, et une cible fausse pour les jours de repos
        de la semaine affichée.
      */}
      <button type="button" className={styles.secondary} onClick={onGoNutrition}>
        🍽 Voir la nutrition
      </button>
    </div>
  );
}
