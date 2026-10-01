import { useEffect, useRef, useState } from 'react';
import { Stepper, stepValue } from '../components/Stepper';
import { dateFor, humanDate, isMonday, nearestMonday } from '../engine/calendar';
import { fr } from '../engine/format';
import { isWakeLockSupported } from '../timer/wakeLock';
import {
  downloadExport,
  downloadPhotoExport,
  importAll,
  importPhotos,
  parseAnyExport,
  resetHistory,
  resetPhotos,
} from '../db/export';
import { formatBytes } from '../media/photo';
import {
  allMeasurements,
  getSettingsRow,
  photoUsage,
  saveSettings,
  type PhotoUsage,
} from '../db/repo';
import type { SettingsRow } from '../db/db';
import styles from './Screens.module.css';


export function SettingsScreen({ onChanged }: { onChanged: () => void }) {
  const [row, setRow] = useState<SettingsRow | null>(null);
  /**
   * Moyenne des 3 dernières pesées du journal Nutrition — exactement ce que
   * §12 demande ici (« moyenne de 3 matinées, à jeun »). On ne la recopie pas
   * d'office : le champ ci-dessous est le relevé officiel du combine, c'est
   * Guillaume qui décide quand le figer.
   */
  const [last3, setLast3] = useState<number | null>(null);
  const [usage, setUsage] = useState<PhotoUsage | null>(null);
  const [confirmPhotos, setConfirmPhotos] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'erreur' } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      setRow(await getSettingsRow());
      const weights = (await allMeasurements())
        .filter((m) => m.weightKg !== null)
        .slice(-3)
        .map((m) => m.weightKg!);
      setLast3(
        weights.length === 3
          ? Math.round((weights.reduce((a, b) => a + b, 0) / 3) * 10) / 10
          : null,
      );
      setUsage(await photoUsage());
    })();
  }, []);

  if (!row) return <div className={styles.loading}>Chargement…</div>;

  async function patch(p: Partial<SettingsRow>) {
    const next = await saveSettings(p);
    setRow(next);
    onChanged();
  }

  /**
   * Un seul bouton d'import pour les deux fichiers : celui des données et celui
   * des photos. L'appli reconnaît lequel on lui donne, ce qui évite de choisir
   * le mauvais bouton et d'écraser ce qu'on voulait garder.
   */
  async function handleImport(file: File) {
    try {
      const parsed = parseAnyExport(await file.text());
      if (parsed.kind === 'photos') {
        const report = await importPhotos(parsed.file);
        setUsage(await photoUsage());
        onChanged();
        setMessage({
          text: `Photos importées : ${report.progressPhotos} de suivi, ${report.exerciseMedia} d’exercice, ${report.exerciseReference} fiche${report.exerciseReference > 1 ? 's' : ''} technique${report.exerciseReference > 1 ? 's' : ''}. L’historique d’entraînement n’a pas été touché.`,
          kind: 'ok',
        });
        return;
      }
      const report = await importAll(parsed.file);
      setRow(await getSettingsRow());
      onChanged();
      setMessage({
        text: `Import réussi : ${report.sets} séries, ${report.sessions} séances, ${report.readiness} readiness, ${report.combines} combines, ${report.measurements} pesées. Les photos ne sont pas dans ce fichier, elles sont restées en place.`,
        kind: 'ok',
      });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Import impossible.', kind: 'erreur' });
    }
  }

  const start = row.startDate;
  const ancreValide = start !== '' && isMonday(start);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Réglages</h1>
        <p className={styles.lead}>Tout est stocké sur ce téléphone. Rien ne part sur internet.</p>
      </header>

      {message && (
        <p className={`${styles.alert} ${message.kind === 'ok' ? styles.alertVert : styles.alertRouge}`}>
          {message.text}
        </p>
      )}

      {/* ------------------------------------------------ date de début -- */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Date de début</h2>
        <p className={styles.cardSub}>
          Le <b>lundi</b> du combine initial. Tout le calendrier en découle : le combine tient sur
          six jours, puis la semaine 1 démarre le lundi suivant.
        </p>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="start-date">
            Lundi du combine initial
          </label>
          <input
            id="start-date"
            className={styles.input}
            type="date"
            value={start}
            onChange={(e) => void patch({ startDate: e.target.value })}
          />
          {start !== '' && !ancreValide && (
            <>
              <p className={`${styles.alert} ${styles.alertRouge}`} style={{ margin: '10px 0 0' }}>
                <b>{humanDate(start)} n’est pas un lundi.</b> Tout le calendrier est calé sur le
                lundi du combine : avec cette date, toutes les séances tombent le mauvais jour de la
                semaine.
              </p>
              <button
                type="button"
                className={styles.secondary}
                style={{ width: '100%', margin: '10px 0 0' }}
                onClick={() => void patch({ startDate: nearestMonday(start) })}
              >
                Corriger : {humanDate(nearestMonday(start))}
              </button>
            </>
          )}
          {ancreValide && (
            <p className={styles.fieldHint}>
              Bilan initial : {humanDate(dateFor(start, 0, 0))}, {humanDate(dateFor(start, 0, 1))}{' '}
              et {humanDate(dateFor(start, 0, 3))}. Semaine 1 le {humanDate(dateFor(start, 1, 0))},
              dernière séance le {humanDate(dateFor(start, 12, 6))}.
            </p>
          )}
        </div>
      </section>

      {/* ------------------------------------------------ poids de corps -- */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Poids de corps</h2>
        <p className={styles.cardSub}>
          §12 — <b>moyenne de 3 matinées, à jeun</b>. C’est un relevé de maison, pas une mesure de
          séance : il ne figure plus dans le flux du combine. Saisis-le ici quand tu veux, la veille
          ou le matin même.
        </p>
        <div className={styles.field}>
          <Stepper
            label="Poids de corps"
            value={row.bodyweightKg}
            step={0.5}
            min={40}
            max={160}
            unit="kg"
            tone="accent"
            onStep={(d) =>
              void patch({
                bodyweightKg: stepValue(row.bodyweightKg, d, 40, 160),
                bodyweightDate: today,
              })
            }
            onCommit={(v) => void patch({ bodyweightKg: v, bodyweightDate: v === null ? '' : today })}
          />
          <p className={styles.fieldHint}>
            {row.bodyweightKg === null
              ? 'Pas encore renseigné. Appuie sur la valeur pour taper 78,3 au clavier.'
              : `Relevé ${row.bodyweightDate ? `le ${humanDate(row.bodyweightDate)}` : 'sans date'}. Appuie sur la valeur pour la saisir au clavier, décimales comprises.`}
          </p>
          {last3 !== null && last3 !== row.bodyweightKg && (
            <button
              type="button"
              className={styles.secondary}
              style={{ width: '100%', margin: '10px 0 0' }}
              onClick={() => void patch({ bodyweightKg: last3, bodyweightDate: today })}
            >
              Reprendre {fr(last3)} kg — moyenne de tes 3 dernières pesées
            </button>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------- alertes ---- */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Fin de repos</h2>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => void patch({ soundEnabled: !row.soundEnabled })}
          aria-pressed={row.soundEnabled}
        >
          Son
          <span className={`${styles.switch} ${row.soundEnabled ? styles.switchOn : ''}`}>
            {row.soundEnabled ? 'activé' : 'coupé'}
          </span>
        </button>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => void patch({ vibrationEnabled: !row.vibrationEnabled })}
          aria-pressed={row.vibrationEnabled}
        >
          Vibration
          <span className={`${styles.switch} ${row.vibrationEnabled ? styles.switchOn : ''}`}>
            {row.vibrationEnabled ? 'activée' : 'coupée'}
          </span>
        </button>
        <p className={styles.fieldHint}>
          Sur iPhone, Safari ne permet pas la vibration : l’alerte sera le son et le passage de la
          barre au vert. Maintien de l’écran pendant le repos :{' '}
          <b>{isWakeLockSupported() ? 'disponible' : 'indisponible sur ce navigateur'}</b>.
        </p>
      </section>

      {/* ----------------------------------------------- export / import -- */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Sauvegarde</h2>
        <p className={styles.cardSub}>
          Un fichier JSON contenant tout ton historique. Si le téléphone casse, c’est ce qui te
          permet de repartir sans rien perdre.
        </p>
        <button
          type="button"
          className={styles.secondary}
          style={{ width: '100%', margin: '12px 0 0' }}
          onClick={() => void downloadExport()}
        >
          Exporter mes données
        </button>
        <button
          type="button"
          className={styles.secondary}
          style={{ width: '100%', margin: '10px 0 0' }}
          onClick={() => fileInput.current?.click()}
        >
          Importer un fichier
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImport(f);
            e.target.value = '';
          }}
        />
        <p className={styles.fieldHint}>
          L’import <b>remplace</b> tout ce qui est enregistré. Fusionner deux historiques créerait
          des séries en double et fausserait les règles de progression. Le même bouton accepte les
          deux fichiers : l’appli reconnaît lequel tu lui donnes.
        </p>
      </section>

      {/* --------------------------------------------- sauvegarde photos -- */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Sauvegarde des photos</h2>
        <p className={styles.cardSub}>
          Fichier séparé, et volontairement. Les photos pèsent mille fois plus que le reste : les
          mettre dans la sauvegarde quotidienne la rendrait si lourde que tu ne la ferais plus, et
          c’est elle qui protège tes douze semaines de séries.
        </p>
        {usage && (
          <p className={styles.fieldHint}>
            {usage.count === 0
              ? 'Aucune photo enregistrée pour l’instant.'
              : `${usage.count} photo${usage.count > 1 ? 's' : ''} · ${formatBytes(usage.bytes)}${
                  usage.quotaBytes !== null
                    ? ` · place accordée par le navigateur : ${formatBytes(usage.quotaBytes)}`
                    : ''
                }`}
          </p>
        )}
        <button
          type="button"
          className={styles.secondary}
          style={{ width: '100%', margin: '12px 0 0' }}
          disabled={!usage || usage.count === 0}
          onClick={() =>
            void (async () => {
              const r = await downloadPhotoExport();
              setMessage({
                text: `${r.count} photo${r.count > 1 ? 's' : ''} exportée${r.count > 1 ? 's' : ''} — ${formatBytes(r.bytes)}. Range ce fichier ailleurs que sur le téléphone.`,
                kind: 'ok',
              });
            })()
          }
        >
          Exporter mes photos
        </button>
        <p className={styles.fieldHint}>
          iOS peut vider le stockage d’une application web quand la place manque sur le téléphone.
          C’est la raison pour laquelle l’appli ne garde aucune vidéo — et la raison d’exporter les
          photos de temps en temps.
        </p>
        {usage && usage.count > 0 && (
          <>
            {!confirmPhotos ? (
              <button
                type="button"
                className={styles.secondary}
                style={{ width: '100%', margin: '10px 0 0', color: 'var(--rouge)' }}
                onClick={() => setConfirmPhotos(true)}
              >
                Effacer toutes les photos
              </button>
            ) : (
              <>
                <p className={styles.fieldHint} style={{ color: 'var(--rouge)' }}>
                  Irréversible. Ton historique d’entraînement, lui, n’est pas touché.
                </p>
                <button
                  type="button"
                  className={styles.secondary}
                  style={{
                    width: '100%',
                    margin: '10px 0 0',
                    background: 'var(--rouge)',
                    color: 'var(--ink-on-accent)',
                  }}
                  onClick={() =>
                    void (async () => {
                      await resetPhotos();
                      setUsage(await photoUsage());
                      setConfirmPhotos(false);
                      onChanged();
                      setMessage({ text: 'Photos effacées.', kind: 'ok' });
                    })()
                  }
                >
                  Oui, effacer les photos
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  style={{ width: '100%', margin: '10px 0 0' }}
                  onClick={() => setConfirmPhotos(false)}
                >
                  Annuler
                </button>
              </>
            )}
          </>
        )}
      </section>

      {/* -------------------------------------------------- remise à zéro -- */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Remise à zéro</h2>
        <p className={styles.cardSub}>
          Efface séances, séries, readiness, combines et pesées. Les réglages ci-dessus et les
          photos sont conservés.
        </p>
        {!confirmReset ? (
          <button
            type="button"
            className={styles.secondary}
            style={{ width: '100%', margin: '12px 0 0', color: 'var(--rouge)' }}
            onClick={() => setConfirmReset(true)}
          >
            Effacer tout l’historique
          </button>
        ) : (
          <>
            <p className={styles.fieldHint} style={{ color: 'var(--rouge)' }}>
              Irréversible. Exporte d’abord si tu veux garder une trace.
            </p>
            <button
              type="button"
              className={styles.secondary}
              style={{ width: '100%', margin: '10px 0 0', background: 'var(--rouge)', color: 'var(--ink-on-accent)' }}
              onClick={() =>
                void (async () => {
                  await resetHistory();
                  setConfirmReset(false);
                  onChanged();
                  setMessage({ text: 'Historique effacé.', kind: 'ok' });
                })()
              }
            >
              Oui, tout effacer
            </button>
            <button
              type="button"
              className={styles.secondary}
              style={{ width: '100%', margin: '10px 0 0' }}
              onClick={() => setConfirmReset(false)}
            >
              Annuler
            </button>
          </>
        )}
      </section>
    </div>
  );
}
