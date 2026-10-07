import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TechniqueImage } from '../media/techniqueImage';
import styles from './TechniqueSheet.module.css';

/**
 * « 📷 Voir le mouvement » — la fiche technique d'un exercice, en plein écran.
 *
 * Purement informatif : la fenêtre s'ouvre PAR-DESSUS la séance, rendue dans
 * `document.body`. La carte de l'exercice reste montée dessous, donc rien de
 * ce qui est saisi — reps, charge, RPE, séries validées, remarque — ne bouge.
 *
 * Fermeture : bouton « Fermer », touche Échap, ou bouton retour du téléphone
 * (une entrée d'historique est posée à l'ouverture, sans toucher à l'ancre
 * `#/session/…` qui pilote la navigation de l'appli).
 */
export function TechniqueSheet({ image, name }: { image: TechniqueImage; name: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.open}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">📷</span> Voir le mouvement
      </button>
      {open &&
        createPortal(
          <Lightbox
            image={image}
            name={name}
            onClose={() => {
              close();
              trigger.current?.focus();
            }}
          />,
          document.body,
        )}
    </>
  );
}

function Lightbox({
  image,
  name,
  onClose,
}: {
  image: TechniqueImage;
  name: string;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [broken, setBroken] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  /** Vrai tant que l'entrée d'historique posée à l'ouverture est la courante. */
  const pushed = useRef(false);

  useEffect(() => {
    // Bouton retour : une entrée d'historique sans changer l'URL. Le retour la
    // retire et déclenche `popstate`, qu'on traduit en fermeture. L'ancre ne
    // change pas, donc le routeur de l'appli (`hashchange`) ne voit rien.
    // Une seule entrée, même si l'effet est rejoué (mode strict en dev).
    if (!(window.history.state as { techniqueSheet?: boolean } | null)?.techniqueSheet) {
      window.history.pushState({ techniqueSheet: true }, '');
    }
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);

    // La séance ne défile plus derrière la fiche.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    closeButton.current?.focus();

    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      root.style.overflow = previousOverflow;
    };
  }, []);

  /** Fermer = revenir en arrière si notre entrée est encore là, sinon fermer. */
  function requestClose() {
    if (pushed.current) {
      window.history.back(); // → popstate → onClose
    } else {
      onClose();
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={image.alt}>
      <div className={styles.bar}>
        <div className={styles.title}>{name}</div>
        <button ref={closeButton} type="button" className={styles.close} onClick={requestClose}>
          Fermer
        </button>
      </div>
      <div className={styles.scroller}>
        {broken ? (
          <p className={styles.missing}>Fiche indisponible pour le moment.</p>
        ) : (
          <>
            <img
              src={image.src}
              alt={image.alt}
              decoding="async"
              className={`${styles.image} ${zoomed ? styles.zoomed : ''}`}
              onClick={() => setZoomed((z) => !z)}
              onError={() => setBroken(true)}
            />
            <p className={styles.hint}>
              {zoomed ? 'Touche la fiche pour revenir à la taille écran.' : 'Touche la fiche pour zoomer.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
