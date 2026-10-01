import { useEffect, useState } from 'react';
import { NUTRITION_TARGETS, type DayKind } from '../data/nutrition';
import { BLOCKS, WEEK_BLOCKS, isCombineDay } from '../data/program';
import { DAY_LABELS, type DayIndex, type WeekIndex } from '../data/types';
import {
  humanDate,
  isMonday,
  locateToday,
  nearestMonday,
  type TodayState,
} from '../engine/calendar';
import { fr } from '../engine/format';
import { getSession } from '../engine/getSession';
import { explosiveTrend, type ExplosiveTrend } from '../engine/trends';
import {
  allSessions,
  allSets,
  buildHistoryIndex,
  getSettingsRow,
  saveSettings,
  toEngineSettings,
} from '../db/repo';
import type { SessionRow } from '../db/db';
import styles from './Screens.module.css';

/**
 * Écran d'ouverture.
 *
 * Défaut n°11 du prototype : il fallait retrouver la bonne semaine et le bon
 * jour à la main. Ici la date fait tout le travail, et le bouton reste
 * disponible pour les jours où le programme décale.
 */
export function TodayScreen({
  onOpen,
  onGoWeek,
  onGoSettings,
  onGoNutrition,
  onDataChanged,
  todayKind,
}: {
  onOpen: (week: WeekIndex, day: DayIndex) => void;
  onGoWeek: (week: WeekIndex) => void;
  onGoSettings: () => void;
  onGoNutrition: () => void;
  /**
   * Prévient l'application qu'un réglage vient de changer.
   *
   * Indispensable après la saisie de la date de début : le palier alimentaire
   * du jour (`todayKind`) est calculé au-dessus, à partir de cette date. Sans
   * ce signal, la carte Nutrition resterait sur « jour de repos » alors qu'une
   * séance est déjà prévue aujourd'hui.
   */
  onDataChanged: () => void;
  /** Palier alimentaire du jour affiché — pas celui d'une semaine entière. */
  todayKind: DayKind;
}) {
  const [state, setState] = useState<{
    loading: boolean;
    today: TodayState | null;
    title: string;
    intensity: string;
    duration: string;
    rows: SessionRow[];
    trend: ExplosiveTrend;
    /** Ancre du calendrier, telle qu'elle est en base. */
    startDate: string;
    /** Le combine est aujourd'hui ou c'est la prochaine séance. */
    combineAhead: boolean;
    bodyweightKg: number | null;
    /** Le combine a mesuré des 1RM qui ne pilotent pas encore les charges. */
  }>({
    loading: true,
    today: null,
    title: '',
    intensity: '',
    duration: '',
    rows: [],
    trend: { declining: false, consecutiveDrops: 0, suggestEarlyDeload: false, weekly: [], message: '' },
    startDate: '',
    combineAhead: false,
    bodyweightKg: null,
  });

  useEffect(() => {
    void (async () => {
      const settingsRow = await getSettingsRow();
      const settings = toEngineSettings(settingsRow);
      const todayIso = new Date().toISOString().slice(0, 10);
      const today = locateToday(settings.startDate, todayIso);

      const [sets, rows] = await Promise.all([allSets(), allSessions()]);
      const history = buildHistoryIndex(sets);
      // Pas de sauts dans ce programme : le cas 7 ne s'applique jamais.
      const trend = explosiveTrend([], todayIso);

      // Aperçu de la séance : seul l'en-tête nous intéresse ici.
      let title = '';
      let intensity = '';
      let duration = '';
      // « before » compte aussi : c'est le meilleur moment pour rappeler le
      // relevé de poids, quelques jours avant le premier test.
      const target =
        today?.kind === 'session'
          ? today.session
          : today?.kind === 'rest'
            ? today.next
            : today?.kind === 'before'
              ? today.first
              : null;
      if (target) {
        const s = getSession(target.week, target.day, {
          settings,
          history,
          readiness: null,
          explosiveDecline: trend.declining,
        });
        title = s?.title ?? '';
        intensity = s?.intensity ?? '';
        duration = s?.durationLabel ?? '';
      }

      setState({
        loading: false,
        today,
        title,
        intensity,
        duration,
        rows,
        trend,
        startDate: settings.startDate,
        combineAhead: target ? isCombineDay(target.week, target.day) : false,
        bodyweightKg: settingsRow.bodyweightKg,
      });
    })();
  }, []);

  if (state.loading) return <div className={styles.loading}>Chargement…</div>;

  const { today, trend } = state;

  /*
   * Premier lancement : on demande l'ancre du calendrier ici, tout de suite,
   * plutôt que de deviner une date. Rien d'autre ne s'affiche tant qu'elle
   * manque — c'est elle qui date les 62 séances.
   */
  if (!today) {
    return (
      <div className={styles.screen}>
        <header className={styles.header}>
          <h1 className={styles.h1}>Bienvenue</h1>
          <p className={styles.lead}>
            Il manque une seule chose pour démarrer : le <b>lundi</b> de ton combine initial. Tout
            le calendrier en découle, et il ne bougera plus ensuite.
          </p>
        </header>
        <section className={styles.card}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="start-date-onboarding">
              Lundi du combine initial
            </label>
            <input
              id="start-date-onboarding"
              className={styles.input}
              type="date"
              value={state.startDate}
              onChange={(e) =>
                void (async () => {
                  await saveSettings({ startDate: e.target.value });
                  // Remonte l'info : l'application recalcule le palier
                  // alimentaire du jour et remonte l'écran avec la date.
                  onDataChanged();
                })()
              }
            />
            <p className={styles.fieldHint}>
              Bilan initial lundi, mardi et jeudi, sans aucune charge maximale. Dimanche repos,
              puis la semaine 1 démarre le lundi.
            </p>
          </div>
        </section>
        <button type="button" className={styles.secondary} onClick={onGoSettings}>
          Ouvrir les Réglages
        </button>
      </div>
    );
  }

  const status = (week: number, day: DayIndex) =>
    state.rows.find((r) => r.week === week && r.day === day)?.status ?? 'planned';

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>
          {humanDate(new Date().toISOString().slice(0, 10))}
        </div>

        {today.kind === 'session' && (
          <>
            <h1 className={styles.todayTitle}>{state.title}</h1>
            <div className={styles.meta}>
              <span
                className={styles.tag}
                style={{ background: BLOCKS[WEEK_BLOCKS[today.session.week]].color }}
              >
                {state.intensity}
              </span>
              <span>
                Semaine <b>{today.session.week === 0 ? 'de test' : today.session.week}</b>
              </span>
              <span>{DAY_LABELS[today.session.day]}</span>
              <span>
                Durée <b>{state.duration}</b>
              </span>
            </div>
          </>
        )}

        {today.kind === 'rest' && (
          <>
            <h1 className={styles.todayTitle}>Repos</h1>
            <p className={styles.lead}>
              Prochaine séance {today.daysUntil === 1 ? 'demain' : `dans ${today.daysUntil} jours`},{' '}
              <b>{DAY_LABELS[today.next.day].toLowerCase()}</b> : {state.title}.
            </p>
          </>
        )}

        {today.kind === 'before' && (
          <>
            <h1 className={styles.todayTitle}>Ça commence bientôt</h1>
            <p className={styles.lead}>
              Premier jour du combine initial dans {today.daysUntil} jour
              {today.daysUntil > 1 ? 's' : ''}, le {humanDate(today.first.date)}.
            </p>
          </>
        )}

        {today.kind === 'finished' && (
          <>
            <h1 className={styles.todayTitle}>12 semaines bouclées</h1>
            <p className={styles.lead}>
              Dernière séance le {humanDate(today.last.date)}. Regarde l’écran Progression pour
              comparer tes trois combines.
            </p>
          </>
        )}
      </header>

      {/*
        Raccourci nutrition. Il vit ici et nulle part ailleurs : l'écran Semaine
        mélange des jours d'entraînement et des jours de repos, donc une carte
        unique y afficherait une cible fausse pour au moins un des jours listés.
      */}
      <button type="button" className={styles.nutriCard} onClick={onGoNutrition}>
        <span className={styles.nutriIcon} aria-hidden="true">
          🍽
        </span>
        <span className={styles.nutriText}>
          <b>Nutrition — {NUTRITION_TARGETS[todayKind].label.toLowerCase()}</b>
          <span>
            {NUTRITION_TARGETS[todayKind].kcal.toLocaleString('fr-FR')} kcal ·{' '}
            {NUTRITION_TARGETS[todayKind].proteinG} g de protéines · voir le détail
          </span>
        </span>
        <span className={styles.nutriChevron} aria-hidden="true">
          ›
        </span>
      </button>

      
      {state.startDate !== '' && !isMonday(state.startDate) && (
        <button
          type="button"
          className={`${styles.alert} ${styles.alertRouge} ${styles.alertAction}`}
          onClick={onGoSettings}
        >
          Ta date de début est un {humanDate(state.startDate).split(' ')[0]}, pas un lundi : toutes
          les séances tombent le mauvais jour. Appuie ici pour la corriger en{' '}
          {humanDate(nearestMonday(state.startDate))}.
        </button>
      )}

      {/* La moyenne de 3 matins se prépare avant, pas à la salle. */}
      {state.combineAhead && (
        <button
          type="button"
          className={`${styles.alert} ${styles.alertAction}`}
          onClick={onGoSettings}
        >
          {state.bodyweightKg === null
            ? 'Combine : n’oublie pas ta moyenne de poids de corps (3 matins, à jeun). Elle se saisit dans Réglages, pas en salle.'
            : `Combine : poids de corps enregistré à ${fr(state.bodyweightKg)} kg. À mettre à jour dans Réglages si ta moyenne a bougé.`}
        </button>
      )}

      {trend.declining && (
        <p className={`${styles.alert} ${trend.suggestEarlyDeload ? styles.alertRouge : ''}`}>
          {trend.message}
        </p>
      )}

      {today.kind === 'session' && (
        <>
          {status(today.session.week, today.session.day) === 'done' ? (
            <>
              <p className={`${styles.alert} ${styles.alertVert}`}>
                Séance déjà marquée comme terminée. Tu peux la rouvrir pour corriger une saisie.
              </p>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => onOpen(today.session.week, today.session.day)}
              >
                Rouvrir la séance
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.primary}
              onClick={() => onOpen(today.session.week, today.session.day)}
            >
              Commencer la séance
            </button>
          )}
          <button
            type="button"
            className={styles.secondary}
            onClick={() => onGoWeek(today.session.week)}
          >
            Voir la semaine · changer de jour
          </button>
        </>
      )}

      {(today.kind === 'rest' || today.kind === 'before') && (
        <>
          <button
            type="button"
            className={styles.primary}
            onClick={() =>
              onOpen(
                today.kind === 'rest' ? today.next.week : today.first.week,
                today.kind === 'rest' ? today.next.day : today.first.day,
              )
            }
          >
            Ouvrir quand même la prochaine séance
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() =>
              onGoWeek(today.kind === 'rest' ? today.next.week : today.first.week)
            }
          >
            Voir la semaine · changer de jour
          </button>
        </>
      )}
    </div>
  );
}
