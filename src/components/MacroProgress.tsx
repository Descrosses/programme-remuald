import { progressPct, type Macros } from '../engine/nutrition';
import { fr } from '../engine/format';
import styles from '../screens/Screens.module.css';

/**
 * Où en est la journée : ce qui a été pris, sur ce qui était prévu.
 *
 * ── La différence avec `MacroBar` ───────────────────────────────────────────
 *
 * `MacroBar` montre une COMPOSITION et reste toujours pleine : de quoi une
 * assiette est faite. Celle-ci montre une PROGRESSION et se remplit : où on en
 * est. Les deux cohabitent sur le même écran parce qu'elles répondent à deux
 * questions, et c'est leur forme qui le dit — une piste vide derrière, ici, et
 * aucune là-bas.
 *
 * ── Le dépassement se voit ──────────────────────────────────────────────────
 *
 * Au-delà de 100 %, la barre déborde dans une teinte d'alerte au lieu d'être
 * ravalée à « plein ». Une journée à +400 kcal et une journée pile dans la
 * cible ne doivent pas donner la même image.
 */
export function MacroProgress({ consumed, planned }: { consumed: Macros; planned: Macros }) {
  const lignes = [
    { cle: 'carbs', nom: 'Glucides', pris: consumed.carbsG, prevu: planned.carbsG },
    { cle: 'protein', nom: 'Protéines', pris: consumed.proteinG, prevu: planned.proteinG },
    { cle: 'fat', nom: 'Lipides', pris: consumed.fatG, prevu: planned.fatG },
  ] as const;

  return (
    <div className={styles.progressList}>
      {lignes.map((l) => {
        const pct = progressPct(l.pris, l.prevu);
        const depasse = pct > 100;
        return (
          <div key={l.cle} className={styles.progressRow}>
            <div className={styles.progressHead}>
              <span className={styles.progressNom}>{l.nom}</span>
              <span className={`${styles.progressVal} tnum`}>
                {fr(Math.round(l.pris))} g <span className={styles.progressPrevu}>
                  / {fr(Math.round(l.prevu))} g
                </span>
              </span>
            </div>
            <div
              className={styles.progressTrack}
              role="img"
              aria-label={`${l.nom} : ${fr(Math.round(l.pris))} g pris sur ${fr(Math.round(l.prevu))} g prévus, ${pct} %`}
            >
              <span
                className={`${styles.progressFill} ${
                  depasse ? styles.progressOver : styles[`macro_${l.cle}`]
                }`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
