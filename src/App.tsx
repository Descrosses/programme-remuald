import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { RestBar } from './components/RestBar';
import type { DayIndex, WeekIndex } from './data/types';
import { CombineScreen } from './screens/CombineScreen';
import { NutritionScreen } from './screens/NutritionScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { SessionScreen } from './screens/SessionScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TodayScreen } from './screens/TodayScreen';
import { WeekScreen } from './screens/WeekScreen';
import { useAppUpdate } from './state/useAppUpdate';
import { useRestTimer } from './state/useRestTimer';
import { useRoute, type Route } from './state/useRoute';
import { weekForTab, writeLastWeek } from './state/lastWeek';
import { useViewportOffset } from './state/useViewportOffset';
import { currentWeek, locateToday } from './engine/calendar';
import type { DayKind } from './data/nutrition';
import { getSettingsRow } from './db/repo';
import styles from './App.module.css';

type TabName = 'today' | 'week' | 'nutrition' | 'progress' | 'combine' | 'settings';

const TABS: Array<{ name: TabName; label: string; icon: string }> = [
  { name: 'today', label: 'Aujourd’hui', icon: '▶' },
  { name: 'week', label: 'Semaine', icon: '▦' },
  { name: 'nutrition', label: 'Nutrition', icon: '🍽' },
  { name: 'progress', label: 'Progrès', icon: '📈' },
  { name: 'combine', label: 'Combine', icon: '⏱' },
  { name: 'settings', label: 'Réglages', icon: '⚙' },
];

export function App() {
  const [alerts, setAlerts] = useState({ sound: true, vibration: true });
  /**
   * Jour d'entraînement ou jour de repos, au sens du plan alimentaire.
   *
   * Calculé ici et non dans l'écran Nutrition : l'écran Aujourd'hui en a besoin
   * aussi pour sa carte de raccourci, et deux calculs séparés finiraient par
   * diverger. Une séance prévue aujourd'hui = jour d'entraînement, le reste
   * (mardi, jeudi, avant le début, après la fin) = jour de repos.
   */
  const [todayKind, setTodayKind] = useState<DayKind>('rest');
  /**
   * Jour de programme de la séance prévue aujourd'hui, `null` s'il n'y en a
   * pas. Lu ici, à la même source que `todayKind`, pour que la carte de
   * carburant de l'écran Nutrition n'ait pas sa propre idée du planning.
   */
  const [todayDay, setTodayDay] = useState<DayIndex | null>(null);
  /**
   * Semaine de programme en cours, `null` hors programme.
   *
   * C'est elle qui dit à l'écran Nutrition dans quelle PHASE on se trouve — une
   * semaine de deload allège les féculents des jours d'entraînement.
   *
   * Elle vient de `currentWeek` et non de la séance du jour : le mardi d'une
   * semaine de deload est un jour de repos, mais on est bien encore dans cette
   * semaine-là, et le bandeau doit le dire.
   */
  const [todayWeek, setTodayWeek] = useState<WeekIndex | null>(null);
  const timer = useRestTimer(alerts);
  const [route, navigate] = useRoute();
  const appUpdate = useAppUpdate();
  /** Incrémenté quand les réglages changent : force les écrans à se recharger. */
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    void (async () => {
      const row = await getSettingsRow();
      setAlerts({ sound: row.soundEnabled, vibration: row.vibrationEnabled });
      const today = locateToday(row.startDate, new Date().toISOString().slice(0, 10));
      setTodayKind(today?.kind === 'session' ? 'train' : 'rest');
      setTodayDay(today?.kind === 'session' ? today.session.day : null);
      setTodayWeek(currentWeek(row.startDate, new Date().toISOString().slice(0, 10)));
    })();
  }, [dataVersion]);

  const openSession = useCallback(
    (week: WeekIndex, day: DayIndex) => navigate({ name: 'session', week, day }),
    [navigate],
  );

  const refresh = useCallback(() => setDataVersion((v) => v + 1), []);

  /*
   * La semaine consultée se retient d'un onglet à l'autre.
   *
   * Elle ne vivait que dans l'URL : en passant par Nutrition, elle disparaissait
   * avec elle, et l'onglet Semaine rouvrait la 1. On la note donc à chaque fois
   * qu'on la regarde, y compris depuis une séance ouverte — c'est bien la
   * semaine où l'on se trouve.
   */
  useEffect(() => {
    if (route.name === 'week' || route.name === 'session') writeLastWeek(route.week);
  }, [route]);

  // Pendant une séance, la barre de navigation disparaît : l'écran est long,
  // le pouce navigue dedans, et une barre de plus multiplierait les appuis ratés.
  const inSession = route.name === 'session';

  /*
   * Sur iOS, un élément en `position: fixed` est ancré au layout viewport, pas
   * à ce qu'on voit. Pendant le défilement, la barre de chrono remontait donc
   * au milieu de l'écran. On publie l'écart ici, une seule fois, et les deux
   * barres du bas s'en servent. Il vaut 0 partout ailleurs.
   */
  const vvOffset = useViewportOffset();

  return (
    <div
      className={inSession ? styles.app : `${styles.app} ${styles.withNav}`}
      style={{ '--vv-offset': `${vvOffset}px` } as CSSProperties}
    >
      {appUpdate.ready && (
        <div className={styles.updateBar} role="status">
          <span>Nouvelle version disponible.</span>
          <button type="button" className={styles.updateButton} onClick={appUpdate.update}>
            Mettre à jour
          </button>
          <button type="button" className={styles.updateLater} onClick={appUpdate.dismiss}>
            Plus tard
          </button>
        </div>
      )}

      <main>
        {renderScreen(
          route,
          dataVersion,
          todayKind,
          todayDay,
          todayWeek,
          openSession,
          navigate,
          refresh,
          timer,
        )}
      </main>

      <RestBar timer={timer} />

      {!inSession && (
        <nav className={styles.nav} aria-label="Navigation principale">
          {TABS.map((tab) => {
            const active = route.name === tab.name;
            return (
              <button
                key={tab.name}
                type="button"
                className={`${styles.tab} ${active ? styles.tabOn : ''}`}
                onClick={() =>
                  navigate(tab.name === 'week' ? { name: 'week', week: weekForTab(route) } : { name: tab.name })
                }
                aria-current={active ? 'page' : undefined}
              >
                <span className={styles.tabIcon} aria-hidden="true">
                  {tab.icon}
                </span>
                <span className={styles.tabLabel}>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function renderScreen(
  route: Route,
  dataVersion: number,
  todayKind: DayKind,
  todayDay: DayIndex | null,
  todayWeek: WeekIndex | null,
  openSession: (week: WeekIndex, day: DayIndex) => void,
  navigate: (route: Route) => void,
  refresh: () => void,
  timer: ReturnType<typeof useRestTimer>,
) {
  switch (route.name) {
    case 'session':
      return (
        <SessionScreen
          key={`${route.week}-${route.day}-${dataVersion}`}
          week={route.week}
          day={route.day}
          timer={timer}
          onBack={() => navigate({ name: 'week', week: route.week })}
        />
      );

    case 'week':
      return (
        <WeekScreen
          key={`${route.week}-${dataVersion}`}
          week={route.week}
          onChangeWeek={(w) => navigate({ name: 'week', week: w })}
          onOpen={openSession}
          onGoNutrition={() => navigate({ name: 'nutrition' })}
        />
      );

    case 'progress':
      return <ProgressScreen key={dataVersion} />;

    case 'nutrition':
      /*
       * `todayKind` fait partie de la clé, pas seulement des props : l'écran
       * s'en sert pour choisir le palier affiché à l'ouverture, et cette
       * décision est prise une seule fois, au montage. Or au démarrage à froid
       * les réglages sont encore en train d'être lus, donc `todayKind` vaut
       * « repos » pendant un instant — sans cette clé, un lundi s'ouvrait sur
       * la journée de repos et y restait.
       */
      return (
        <NutritionScreen
          key={`${dataVersion}-${todayKind}`}
          todayKind={todayKind}
          todayDay={todayDay}
          todayWeek={todayWeek}
        />
      );

    case 'combine':
      return <CombineScreen key={dataVersion} />;

    case 'settings':
      return <SettingsScreen key={dataVersion} onChanged={refresh} />;

    default:
      return (
        <TodayScreen
          key={dataVersion}
          onOpen={openSession}
          onGoWeek={(w) => navigate({ name: 'week', week: w })}
          onGoSettings={() => navigate({ name: 'settings' })}
          onGoNutrition={() => navigate({ name: 'nutrition' })}
          onDataChanged={refresh}
          todayKind={todayKind}
        />
      );
  }
}
