import { useState } from 'react';
import { READINESS_QUESTIONS, readinessFromAnswers } from '../engine/readiness';
import type { ReadinessResult } from '../engine/types';
import styles from '../screens/Session.module.css';

/**
 * Readiness SANS SAUT — programme Remuald.
 *
 * Consigne de départ : aucun saut au début. Le test de forme du jour est donc
 * un questionnaire de 3 questions, posé après l'échauffement des séances
 * jambes. Le verdict modifie réellement la séance affichée en dessous :
 * 0 oui → vert, 1 oui → orange, 2-3 oui → rouge.
 *
 * Les réponses sont stockées dans le champ `attempts` de la ligne de readiness
 * (1 = oui, 0 = non), pour ne rien changer au schéma de la base.
 */
export function ReadinessSection({
  answers,
  result,
  onSave,
}: {
  answers: Array<boolean | null>;
  result: ReadinessResult | null;
  onSave: (answers: Array<boolean | null>) => void;
}) {
  const [draft, setDraft] = useState<Array<boolean | null>>(answers);
  const preview = readinessFromAnswers(draft);
  const shown = result ?? preview;
  const level = shown?.level;
  const complete = preview !== null;

  const answer = (i: number, value: boolean) => {
    setDraft((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  };

  return (
    <section
      className={`${styles.ready} ${
        level === 'vert'
          ? styles.readyVert
          : level === 'orange'
            ? styles.readyOrange
            : level === 'rouge'
              ? styles.readyRouge
              : ''
      }`}
      aria-label="Test de forme du jour"
    >
      <h2 className={styles.readyTitle}>Forme du jour — 3 questions</h2>
      <p className={styles.readyHint}>
        Après l’échauffement. Réponds franchement : la séance s’adapte, elle ne se saute pas.
      </p>

      <div className={styles.jumps}>
        {READINESS_QUESTIONS.map((q, i) => (
          <div key={q} className={styles.question}>
            <span className={styles.questionText}>{q}</span>
            <div className={styles.yesNo} role="group" aria-label={q}>
              <button
                type="button"
                className={`${styles.yesNoButton} ${draft[i] === true ? styles.yesNoOn : ''}`}
                onClick={() => answer(i, true)}
                aria-pressed={draft[i] === true}
              >
                Oui
              </button>
              <button
                type="button"
                className={`${styles.yesNoButton} ${draft[i] === false ? styles.yesNoOn : ''}`}
                onClick={() => answer(i, false)}
                aria-pressed={draft[i] === false}
              >
                Non
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className={styles.readyValidate}
        onClick={() => onSave(draft)}
        disabled={!complete}
      >
        {result ? 'Mettre à jour le verdict' : 'Valider'}
      </button>

      {shown && (
        <div className={styles.verdict}>
          <span
            className={`${styles.verdictLevel} ${
              level === 'vert'
                ? styles.levelVert
                : level === 'orange'
                  ? styles.levelOrange
                  : styles.levelRouge
            }`}
          >
            {shown.level.toUpperCase()}
          </span>{' '}
          <span className="tnum">
            ({shown.jumpCm} oui sur {READINESS_QUESTIONS.length})
          </span>
          <div style={{ marginTop: 6 }}>{shown.effect}</div>
          {!result && <div style={{ marginTop: 6, color: 'var(--ink-3)' }}>Pas encore validé.</div>}
        </div>
      )}
    </section>
  );
}
