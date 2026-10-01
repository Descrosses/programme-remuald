/**
 * Chrono de repos.
 *
 * Défaut n°8 du prototype : le chrono ne survivait pas au verrouillage de
 * l'écran. Ici on ne décompte jamais — on stocke **l'horodatage de fin** et on
 * recalcule le temps restant à chaque affichage. Écran verrouillé, appli en
 * arrière-plan, onglet ralenti : au retour, le chiffre est juste.
 *
 * L'état est dans `localStorage` et pas dans IndexedDB : c'est un état
 * éphémère de quelques minutes, qui doit être lu de façon synchrone au premier
 * rendu. L'historique, lui, est en base.
 */

const KEY = 'premuald:rest-timer';

export interface RestTimerState {
  /** Horodatage de fin, en ms epoch. */
  endsAt: number;
  /** Durée totale demandée, pour la barre de progression. */
  totalSec: number;
  /** « Repos — Back Squat, série 2 ». */
  label: string;
  /** Repos déjà signalé comme terminé (évite de re-sonner à chaque retour). */
  notified: boolean;
}

export function readTimer(): RestTimerState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RestTimerState;
    if (typeof parsed?.endsAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeTimer(state: RestTimerState | null): void {
  try {
    if (state === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* mode privé, quota : le chrono marche quand même dans l'onglet courant */
  }
}

export function startTimer(totalSec: number, label: string, now = Date.now()): RestTimerState {
  const state: RestTimerState = {
    endsAt: now + totalSec * 1000,
    totalSec,
    label,
    notified: false,
  };
  writeTimer(state);
  return state;
}

export function addSeconds(state: RestTimerState, seconds: number): RestTimerState {
  const next: RestTimerState = {
    ...state,
    endsAt: state.endsAt + seconds * 1000,
    totalSec: state.totalSec + seconds,
    notified: false,
  };
  writeTimer(next);
  return next;
}

/** Secondes restantes, jamais négatif. Recalculé, jamais décrémenté. */
export function remainingSec(state: RestTimerState, now = Date.now()): number {
  return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}

/** Secondes écoulées depuis la fin — pour afficher « +0:12 » après le repos. */
export function overtimeSec(state: RestTimerState, now = Date.now()): number {
  return Math.max(0, Math.floor((now - state.endsAt) / 1000));
}

export function isFinished(state: RestTimerState, now = Date.now()): boolean {
  return now >= state.endsAt;
}

/** 0 → 1. Sert à la barre de progression. */
export function progress(state: RestTimerState, now = Date.now()): number {
  if (state.totalSec <= 0) return 1;
  const elapsed = state.totalSec - remainingSec(state, now);
  return Math.min(1, Math.max(0, elapsed / state.totalSec));
}

// ---------------------------------------------------------------------------
// Alerte de fin
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null;

/**
 * iOS n'autorise la création d'un contexte audio que pendant un geste
 * utilisateur. On l'amorce au moment où Guillaume valide une série.
 */
export function primeAudio(): void {
  if (audioCtx) return;
  try {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx = new Ctor();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

export function beep(): void {
  if (!audioCtx) return;
  try {
    void audioCtx.resume();
    const now = audioCtx.currentTime;
    for (const [i, freq] of [880, 1174].entries()) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.18);
    }
  } catch {
    /* pas de son : la vibration et l'écran suffisent */
  }
}

export function vibrate(): void {
  try {
    navigator.vibrate?.([220, 120, 220]);
  } catch {
    /* iOS ne vibre pas depuis le web : le son et l'écran prennent le relais */
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Notification locale de fin de repos.
 *
 * Passe par le service worker quand il est disponible : c'est la seule voie
 * qui fonctionne sur une PWA iOS installée. Sinon, notification classique.
 */
export async function notifyRestOver(label: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const body = 'Repos terminé — série suivante.';
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(label, { body, tag: 'repos', silent: false });
      return;
    }
    new Notification(label, { body, tag: 'repos' });
  } catch {
    /* notification indisponible : ce n'est pas bloquant */
  }
}
