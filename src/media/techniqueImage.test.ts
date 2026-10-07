/**
 * Fiches techniques : l'association exercice → fichier, et le garde-fou qui
 * cache le bouton tant que la fiche n'est pas déposée.
 */

import { describe, expect, it } from 'vitest';
import { techniqueImageFor, TECHNIQUE_IMAGE_DIR } from './techniqueImage';
import { EXERCISES } from '../data/exercises';
import { BASE_SESSIONS } from '../data/baseSessions';
import { BLOCK_RULES } from '../data/blockRules';

const GOBLET = EXERCISES['goblet-squat']!;

describe('techniqueImageFor', () => {
  it('rend la fiche quand le fichier existe', () => {
    const img = techniqueImageFor(GOBLET, ['goblet-squat.webp']);
    expect(img).toEqual({
      src: `/${TECHNIQUE_IMAGE_DIR}goblet-squat.webp`,
      alt: 'Fiche technique — Goblet Squat',
    });
  });

  it('ne rend rien tant que le fichier n’est pas déposé : pas de bouton, pas d’image cassée', () => {
    expect(techniqueImageFor(GOBLET, [])).toBeNull();
    expect(techniqueImageFor(GOBLET, ['leg-press.webp'])).toBeNull();
  });

  it('reconnaît la fiche quelle que soit son extension (png, jpg) et sa casse', () => {
    expect(techniqueImageFor(GOBLET, ['goblet-squat.png'])?.src).toBe(`/${TECHNIQUE_IMAGE_DIR}goblet-squat.png`);
    expect(techniqueImageFor(GOBLET, ['Goblet-Squat.JPG'])?.src).toBe(`/${TECHNIQUE_IMAGE_DIR}Goblet-Squat.JPG`);
    expect(techniqueImageFor(GOBLET, ['goblet-squat-v2.png'])).toBeNull();
  });

  it('ne rend rien pour un exercice qui ne déclare pas de fiche', () => {
    expect(techniqueImageFor(EXERCISES['zone2-cardio']!, ['zone2-cardio.webp'])).toBeNull();
  });
});

describe('association exercice → fiche', () => {
  it('chaque nom de fichier suit la convention : minuscules, tirets, .webp', () => {
    for (const ex of Object.values(EXERCISES)) {
      if (!ex.techniqueImage) continue;
      expect(ex.techniqueImage, ex.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.webp$/);
    }
  });

  it('les fiches attendues pour les séances de Remuald', () => {
    const programmes = new Set<string>([
      ...Object.values(BASE_SESSIONS).flatMap((b) => b!.slots.map((s) => s.exId)),
      ...BLOCK_RULES.flatMap((r) => r.rules.flatMap((x) => (x.op === 'insert' ? [x.slot.exId] : []))),
    ]);
    const attendu = Object.fromEntries(
      [...programmes].sort().map((id) => [id, EXERCISES[id]?.techniqueImage ?? null]),
    );
    expect(attendu).toEqual({
      'adductor-machine': 'adductor-machine.webp',
      'back-squat': 'back-squat.webp',
      'bench-press': 'bench-press.webp',
      'cable-chop': 'cable-chop-high-low.webp',
      'cable-external-rotation': 'cable-external-rotation.webp',
      'chest-supported-row': 'chest-supported-dumbbell-row.webp',
      conditioning: null,
      'db-rdl': 'rdl-dumbbells.webp',
      'db-shoulder-press': 'seated-dumbbell-shoulder-press.webp',
      'dead-bug': 'dead-bug.webp',
      'face-pull': 'face-pull.webp',
      'farmer-carry': 'farmer-carry.webp',
      'goblet-squat': 'goblet-squat.webp',
      'hip-thrust': 'hip-thrust.webp',
      'incline-db-press': 'incline-dumbbell-press.webp',
      'knee-raise': 'roman-chair-knee-raise.webp',
      'lat-pulldown': 'lat-pulldown.webp',
      'leg-curl': 'leg-curl.webp',
      'leg-extension': 'leg-extension.webp',
      'leg-press': 'leg-press.webp',
      'neutral-lat-pulldown': 'neutral-grip-lat-pulldown.webp',
      'one-arm-cable-row': 'single-arm-cable-row.webp',
      'pallof-press': 'pallof-press.webp',
      plank: 'plank.webp',
      rdl: 'barbell-rdl.webp',
      'single-leg-press': 'single-leg-press.webp',
      'step-up': 'step-up.webp',
      'suitcase-carry': 'suitcase-carry.webp',
      'zone2-cardio': null,
    });
  });
});
