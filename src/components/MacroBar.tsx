import { macroShare } from '../engine/macroBar';
import type { Macros } from '../engine/nutrition';
import { fr } from '../engine/format';
import styles from '../screens/Screens.module.css';

/**
 * De quoi un repas est fait, d'un coup d'œil.
 *
 * ── Ce que la barre montre, et ce qu'elle ne montre pas ─────────────────────
 *
 * Elle montre une COMPOSITION : la part de l'énergie qui vient des glucides,
 * des protéines, des lipides. Elle est donc toujours pleine, et c'est voulu.
 *
 * Elle ne montre pas une progression. Les applis de suivi affichent « 0 g sur
 * 330 g » parce qu'elles comptent ce qui a été mangé ; ici rien n'est saisi,
 * le plan dit ce qu'il y a à manger. Une barre à moitié vide laisserait croire
 * qu'il manque quelque chose.
 *
 * ── L'identité ne passe jamais par la seule couleur ─────────────────────────
 *
 * Les trois grammages sont écrits sous la barre, chacun avec son libellé, dans
 * l'ordre des segments. Un daltonien lit la même chose que tout le monde ; la
 * couleur ne fait qu'accélérer la lecture.
 */
export function MacroBar({
  macros,
  labels = 'grammes',
}: {
  macros: Macros;
  /**
   * Ce qu'on écrit sous la barre.
   *
   * `grammes` sur un repas : c'est l'information neuve, personne n'a les
   * grammes de ce repas-là sous les yeux. `parts` sur la journée, où les trois
   * grammages sont déjà écrits juste au-dessus en gros — les répéter n'aurait
   * rien appris, alors que les proportions, si.
   */
  labels?: 'grammes' | 'parts';
}) {
  const part = macroShare(macros);
  if (part === null) return null;

  const segments = [
    { cle: 'carbs', pct: part.carbs, g: macros.carbsG, court: 'G', long: 'glucides' },
    { cle: 'protein', pct: part.protein, g: macros.proteinG, court: 'P', long: 'protéines' },
    { cle: 'fat', pct: part.fat, g: macros.fatG, court: 'L', long: 'lipides' },
  ] as const;

  const lu = segments.map((s) => `${fr(Math.round(s.g))} g de ${s.long}, ${s.pct} %`).join(' ; ');

  return (
    <div className={styles.macroBlock}>
      {/* Une seule image pour le lecteur d'écran : trois barres annoncées
          séparément donneraient trois annonces pour une seule information. */}
      <div className={styles.macroTrack} role="img" aria-label={lu}>
        {segments.map((s) =>
          s.pct === 0 ? null : (
            <span
              key={s.cle}
              className={`${styles.macroFill} ${styles[`macro_${s.cle}`]}`}
              style={{ width: `${s.pct}%` }}
            />
          ),
        )}
      </div>
      <div className={styles.macroLegend} aria-hidden="true">
        {segments.map((s) => (
          <span key={s.cle} className={styles.macroItem}>
            <span className={`${styles.macroDot} ${styles[`macro_${s.cle}`]}`} />
            <span className={styles.macroCle}>{s.court}</span>
            <span className="tnum">
              {labels === 'grammes' ? `${fr(Math.round(s.g))} g` : `${s.pct} %`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
