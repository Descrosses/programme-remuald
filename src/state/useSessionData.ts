/**
 * Chargement d'une séance : réglages, historique, readiness, séries déjà
 * saisies. Tout vient de la base locale, rien du réseau.
 */

import { useCallback, useEffect, useState } from 'react';
import type { DayIndex, WeekIndex } from '../data/types';
import { dateFor } from '../engine/calendar';
import { getSession as buildSession, type ResolvedSession } from '../engine/getSession';
import { readinessFromAnswers } from '../engine/readiness';
import type { ExplosiveTrend } from '../engine/trends';
import type { HistoryIndex, ReadinessResult } from '../engine/types';
import type { ReadinessRow, SessionRow, SetRow } from '../db/db';
import {
  buildHistoryIndex,
  allSets,
  ensureSession,
  getReadiness,
  getSettingsRow,
  toEngineSettings,
} from '../db/repo';

const NO_TREND: ExplosiveTrend = {
  declining: false,
  consecutiveDrops: 0,
  suggestEarlyDeload: false,
  weekly: [],
  message: '',
};

export interface SessionData {
  loading: boolean;
  /** `null` = pas de séance ce jour-là. */
  session: ResolvedSession | null;
  row: SessionRow | null;
  /** Séries déjà enregistrées, groupées par exercice. */
  savedSets: Record<string, SetRow[]>;
  /**
   * Les occurrences réelles des 12 semaines, déjà construites ici pour §11.
   * L'encart « la dernière fois » lit la MÊME chose : une seule requête, une
   * seule vérité. Deux sources finiraient par se contredire.
   */
  history: HistoryIndex;
  readinessRow: ReadinessRow | null;
  readiness: ReadinessResult | null;
  baselineCm: number | null;
  trend: ExplosiveTrend;
  date: string;
  reload: () => Promise<void>;
}

export function useSessionData(week: WeekIndex, day: DayIndex): SessionData {
  const [state, setState] = useState<Omit<SessionData, 'reload'>>(() => empty());

  const reload = useCallback(async () => {
    const settingsRow = await getSettingsRow();
    const settings = toEngineSettings(settingsRow);
    const date = settings.startDate ? dateFor(settings.startDate, week, day) : '';

    const [sets, readinessRow] = await Promise.all([allSets(), getReadiness(week, day)]);

    const history = buildHistoryIndex(sets);
    // Pas de sauts dans ce programme : le cas 7 (sauts en baisse) ne s'applique pas.
    const trend = NO_TREND;

    const readinessResult = readinessRow
      ? readinessFromAnswers(readinessRow.attempts.map((a) => (a === null ? null : a === 1)))
      : null;

    const session = buildSession(week, day, {
      settings,
      history,
      readiness: readinessResult,
      explosiveDecline: trend.declining,
    });

    // La ligne de séance n'est créée que si la case porte une séance.
    const row = session && date ? await ensureSession(week, day, date) : null;

    const savedSets: Record<string, SetRow[]> = {};
    if (row?.id !== undefined) {
      for (const s of sets.filter((x) => x.sessionId === row.id)) {
        (savedSets[s.exerciseId] ??= []).push(s);
      }
      for (const list of Object.values(savedSets)) list.sort((a, b) => a.setIndex - b.setIndex);
    }

    setState({
      loading: false,
      session,
      row,
      savedSets,
      readinessRow: readinessRow ?? null,
      readiness: readinessResult,
      baselineCm: settings.broadJumpBaselineCm,
      trend,
      date,
      history,
    });
  }, [week, day]);

  useEffect(() => {
    setState(empty());
    void reload();
  }, [reload]);

  return { ...state, reload };
}

function empty(): Omit<SessionData, 'reload'> {
  return {
    loading: true,
    session: null,
    row: null,
    savedSets: {},
    readinessRow: null,
    readiness: null,
    baselineCm: null,
    trend: { declining: false, consecutiveDrops: 0, suggestEarlyDeload: false, weekly: [], message: '' },
    date: '',
    history: {},
  };
}
