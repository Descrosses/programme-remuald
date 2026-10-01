/**
 * Le chrono ne décompte pas : il compare à un horodatage de fin. C'est ce qui
 * le rend immunisé au verrouillage de l'écran et au changement d'appli.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  addSeconds,
  isFinished,
  overtimeSec,
  progress,
  readTimer,
  remainingSec,
  startTimer,
  writeTimer,
} from './restTimer';

const T0 = 1_800_000_000_000;

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe('chrono de repos', () => {
  it('mémorise l’heure de fin, pas un compteur', () => {
    const t = startTimer(210, 'Back Squat', T0);
    expect(t.endsAt).toBe(T0 + 210_000);
    expect(remainingSec(t, T0)).toBe(210);
  });

  it('reste juste après un long passage en arrière-plan', () => {
    const t = startTimer(210, 'Back Squat', T0);
    // Écran verrouillé pendant 3 minutes : aucun tick n’a eu lieu.
    expect(remainingSec(t, T0 + 180_000)).toBe(30);
    expect(remainingSec(t, T0 + 209_500)).toBe(1);
  });

  it('ne descend jamais sous zéro et compte le dépassement', () => {
    const t = startTimer(60, 'Pogo', T0);
    expect(remainingSec(t, T0 + 90_000)).toBe(0);
    expect(overtimeSec(t, T0 + 90_000)).toBe(30);
    expect(isFinished(t, T0 + 60_000)).toBe(true);
    expect(isFinished(t, T0 + 59_000)).toBe(false);
  });

  it('+30 s repousse la fin et réarme l’alerte', () => {
    const t = startTimer(60, 'Pogo', T0);
    const plus = addSeconds(t, 30);
    expect(remainingSec(plus, T0)).toBe(90);
    expect(plus.totalSec).toBe(90);
    expect(plus.notified).toBe(false);
  });

  it('la progression va de 0 à 1', () => {
    const t = startTimer(100, 'x', T0);
    expect(progress(t, T0)).toBe(0);
    expect(progress(t, T0 + 50_000)).toBeCloseTo(0.5, 2);
    expect(progress(t, T0 + 200_000)).toBe(1);
  });

  it('survit à un rechargement de l’appli', () => {
    startTimer(210, 'Deadlift', T0);
    const relu = readTimer()!;
    expect(relu.label).toBe('Deadlift');
    expect(remainingSec(relu, T0 + 60_000)).toBe(150);
  });

  it('un stockage vide ou corrompu ne fait pas planter l’appli', () => {
    expect(readTimer()).toBeNull();
    localStorage.setItem('premuald:rest-timer', '{pas du json');
    expect(readTimer()).toBeNull();
    writeTimer(null);
    expect(readTimer()).toBeNull();
  });
});
