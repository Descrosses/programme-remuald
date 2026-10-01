/**
 * Export et import de la totalité des données.
 *
 * Défaut n°10 du prototype : si le téléphone casse, tout est perdu. Ici un
 * fichier JSON contient l'intégralité de l'historique, lisible et réimportable.
 */

import { blobToDataUrl, dataUrlToBlob } from '../media/photo';
import {
  db,
  type CombineRow,
  type ExerciseVideoLogRow,
  type MeasurementRow,
  type ReadinessRow,
  type SessionRow,
  type SetRow,
  type SettingsRow,
} from './db';

/** Version du format, pour qu'un export d'aujourd'hui reste lisible plus tard. */
export const EXPORT_VERSION = 1;

export interface ExportFile {
  format: 'programme-remuald';
  version: number;
  exportedAt: string;
  settings: SettingsRow | null;
  sessions: SessionRow[];
  sets: SetRow[];
  readiness: ReadinessRow[];
  combines: CombineRow[];
  /** Absent des exports antérieurs à l'onglet Nutrition : toujours optionnel. */
  measurements?: MeasurementRow[];
  /** Traces de vidéo — quelques octets chacune, elles restent ici. */
  videoLog?: ExerciseVideoLogRow[];
  /**
   * Toujours `false`. Les photos ont leur propre fichier : voir
   * `exportPhotos()` et le commentaire qui l'accompagne.
   */
  photosIncluded: false;
}

/**
 * Fichier de photos, séparé du fichier de données.
 *
 * Pourquoi deux fichiers plutôt qu'un :
 *
 * 1. Le base64 gonfle de 33 %. Douze semaines chargées en photos d'exercice
 *    peuvent peser 50 Mo en base, soit ~67 Mo de chaîne JSON. `JSON.stringify`
 *    sur une chaîne pareille fait tomber Safari sur iPhone bien avant la fin.
 * 2. La sauvegarde de sécurité doit rester légère pour être faite souvent.
 *    Un fichier de 60 Ko qu'on exporte chaque semaine protège l'historique
 *    d'entraînement, qui est irremplaçable ; un fichier de 67 Mo ne serait
 *    jamais exporté.
 *
 * Les photos partent donc à la demande, dans leur propre fichier, et l'import
 * reconnaît tout seul lequel des deux on lui donne.
 */
export interface PhotoExportFile {
  format: 'programme-remuald-photos';
  version: number;
  exportedAt: string;
  progressPhotos: Array<{ week: number; date: string; dataUrl: string; width: number; height: number }>;
  exerciseMedia: Array<{
    exerciseId: string;
    week: number;
    day: number;
    date: string;
    dataUrl: string;
    width: number;
    height: number;
  }>;
  /** Fiches techniques. Absentes des exports antérieurs : toujours optionnel. */
  exerciseReference?: Array<{
    exerciseId: string;
    addedAt: string;
    dataUrl: string;
    width: number;
    height: number;
  }>;
}

export async function exportAll(): Promise<ExportFile> {
  const [settings, sessions, sets, readiness, combines, measurements, videoLog] =
    await Promise.all([
      db.settings.get(1),
      db.sessions.toArray(),
      db.sets.toArray(),
      db.readiness.toArray(),
      db.combines.toArray(),
      db.measurements.toArray(),
      db.exerciseVideoLog.toArray(),
    ]);

  return {
    format: 'programme-remuald',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings ?? null,
    sessions,
    sets,
    readiness,
    combines,
    measurements,
    videoLog,
    photosIncluded: false,
  };
}

/** Le fichier de photos, construit à la demande. */
export async function exportPhotos(): Promise<PhotoExportFile> {
  const [photos, media, references] = await Promise.all([
    db.progressPhotos.toArray(),
    db.exerciseMedia.toArray(),
    db.exerciseReference.toArray(),
  ]);
  return {
    format: 'programme-remuald-photos',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    progressPhotos: await Promise.all(
      photos.map(async (p) => ({
        week: p.week,
        date: p.date,
        width: p.width,
        height: p.height,
        dataUrl: await blobToDataUrl(p.blob),
      })),
    ),
    exerciseMedia: await Promise.all(
      media.map(async (m) => ({
        exerciseId: m.exerciseId,
        week: m.week,
        day: m.day,
        date: m.date,
        width: m.width,
        height: m.height,
        dataUrl: await blobToDataUrl(m.blob),
      })),
    ),
    exerciseReference: await Promise.all(
      references.map(async (r) => ({
        exerciseId: r.exerciseId,
        addedAt: r.addedAt,
        width: r.width,
        height: r.height,
        dataUrl: await blobToDataUrl(r.blob),
      })),
    ),
  };
}

/** Nom de fichier daté, pour ne pas écraser un export précédent. */
export function exportFileName(now = new Date()): string {
  return `programme-remuald-${now.toISOString().slice(0, 10)}.json`;
}

function download(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Laisse le temps au navigateur de démarrer le téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Déclenche le téléchargement du fichier de données depuis le navigateur. */
export async function downloadExport(): Promise<void> {
  download(JSON.stringify(await exportAll(), null, 2), exportFileName());
}

/**
 * Téléchargement du fichier de photos.
 *
 * Sans indentation, contrairement au fichier de données : sur des dizaines de
 * chaînes base64, les espaces ajoutent des mégaoctets pour une lisibilité dont
 * personne n'a l'usage. Rend la taille produite, pour l'annoncer.
 */
export async function downloadPhotoExport(): Promise<{ bytes: number; count: number }> {
  const file = await exportPhotos();
  const json = JSON.stringify(file);
  download(json, `programme-remuald-photos-${new Date().toISOString().slice(0, 10)}.json`);
  return {
    bytes: new Blob([json]).size,
    count: file.progressPhotos.length + file.exerciseMedia.length,
  };
}

export interface ImportReport {
  sessions: number;
  sets: number;
  readiness: number;
  combines: number;
  measurements: number;
  videoLog: number;
  settings: boolean;
}

export interface PhotoImportReport {
  progressPhotos: number;
  exerciseMedia: number;
  exerciseReference: number;
}

/** Ce que contient un fichier déposé — l'import s'adapte au lieu d'exiger. */
export type AnyExportFile =
  | { kind: 'données'; file: ExportFile }
  | { kind: 'photos'; file: PhotoExportFile };

/**
 * Reconnaît lequel des deux fichiers on vient de recevoir.
 *
 * Guillaume n'a pas à se souvenir du bouton qu'il avait utilisé : il dépose le
 * fichier, l'appli voit ce que c'est.
 */
export function parseAnyExport(text: string): AnyExportFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Ce fichier n’est pas du JSON valide.');
  }
  if ((parsed as { format?: string })?.format === 'programme-remuald-photos') {
    const f = parsed as PhotoExportFile;
    return {
      kind: 'photos',
      file: {
        format: 'programme-remuald-photos',
        version: f.version ?? EXPORT_VERSION,
        exportedAt: f.exportedAt ?? '',
        progressPhotos: f.progressPhotos ?? [],
        exerciseMedia: f.exerciseMedia ?? [],
        exerciseReference: f.exerciseReference ?? [],
      },
    };
  }
  return { kind: 'données', file: parseExport(text) };
}

/** Remplace les photos par celles du fichier. Ne touche à aucune autre table. */
export async function importPhotos(file: PhotoExportFile): Promise<PhotoImportReport> {
  const progress = await Promise.all(
    file.progressPhotos.map(async (p) => {
      const blob = await dataUrlToBlob(p.dataUrl);
      return { week: p.week, date: p.date, width: p.width, height: p.height, blob, bytes: blob.size };
    }),
  );
  const media = await Promise.all(
    file.exerciseMedia.map(async (m) => {
      const blob = await dataUrlToBlob(m.dataUrl);
      return {
        exerciseId: m.exerciseId,
        week: m.week,
        day: m.day as 0 | 1 | 2 | 3 | 4,
        date: m.date,
        width: m.width,
        height: m.height,
        blob,
        bytes: blob.size,
      };
    }),
  );

  const references = await Promise.all(
    (file.exerciseReference ?? []).map(async (r) => {
      const blob = await dataUrlToBlob(r.dataUrl);
      return {
        exerciseId: r.exerciseId,
        addedAt: r.addedAt,
        width: r.width,
        height: r.height,
        blob,
        bytes: blob.size,
      };
    }),
  );

  await db.transaction(
    'rw',
    [db.progressPhotos, db.exerciseMedia, db.exerciseReference],
    async () => {
      await Promise.all([
        db.progressPhotos.clear(),
        db.exerciseMedia.clear(),
        db.exerciseReference.clear(),
      ]);
      await db.progressPhotos.bulkAdd(progress);
      await db.exerciseMedia.bulkAdd(media);
      await db.exerciseReference.bulkAdd(references);
    },
  );

  return {
    progressPhotos: progress.length,
    exerciseMedia: media.length,
    exerciseReference: references.length,
  };
}

/** Vérifie qu'un fichier est bien un export de cette appli avant d'y toucher. */
export function parseExport(text: string): ExportFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Ce fichier n’est pas du JSON valide.');
  }
  const f = parsed as Partial<ExportFile>;
  if (f?.format !== 'programme-remuald') {
    throw new Error('Ce fichier ne vient pas de cette application.');
  }
  if (typeof f.version !== 'number' || f.version > EXPORT_VERSION) {
    throw new Error(
      `Ce fichier vient d’une version plus récente (${String(f.version)}). Mets l’application à jour.`,
    );
  }
  return {
    format: 'programme-remuald',
    version: f.version,
    exportedAt: f.exportedAt ?? '',
    settings: f.settings ?? null,
    sessions: f.sessions ?? [],
    sets: f.sets ?? [],
    readiness: f.readiness ?? [],
    combines: f.combines ?? [],
    // Un export d'avant l'onglet Nutrition n'a pas ce tableau : liste vide, pas
    // une erreur — il reste parfaitement réimportable.
    measurements: f.measurements ?? [],
    videoLog: f.videoLog ?? [],
    photosIncluded: false,
  };
}

/**
 * Remplace intégralement le contenu de la base par celui du fichier.
 *
 * Volontairement destructif et sans fusion : mélanger deux historiques
 * produirait des doublons de séries et fausserait les règles de progression.
 * L'écran d'import prévient avant d'appeler cette fonction.
 */
export async function importAll(file: ExportFile): Promise<ImportReport> {
  return db.transaction(
    'rw',
    [
      db.settings,
      db.sessions,
      db.sets,
      db.readiness,
      db.combines,
      db.measurements,
      db.exerciseVideoLog,
    ],
    async () => {
      const measurements = file.measurements ?? [];
      const videoLog = file.videoLog ?? [];
      await Promise.all([
        db.sessions.clear(),
        db.sets.clear(),
        db.readiness.clear(),
        db.combines.clear(),
        db.measurements.clear(),
        db.exerciseVideoLog.clear(),
      ]);
      if (file.settings) await db.settings.put({ ...file.settings, id: 1 });
      await db.sessions.bulkAdd(file.sessions);
      await db.sets.bulkAdd(file.sets);
      await db.readiness.bulkAdd(file.readiness);
      await db.combines.bulkAdd(file.combines);
      await db.measurements.bulkAdd(measurements);
      await db.exerciseVideoLog.bulkAdd(videoLog);

      return {
        sessions: file.sessions.length,
        sets: file.sets.length,
        readiness: file.readiness.length,
        combines: file.combines.length,
        measurements: measurements.length,
        videoLog: videoLog.length,
        settings: file.settings !== null,
      };
    },
  );
}

/** Efface tout l'historique. Les réglages sont conservés. */
export async function resetHistory(): Promise<void> {
  await db.transaction(
    'rw',
    [db.sessions, db.sets, db.readiness, db.combines, db.measurements, db.exerciseVideoLog],
    async () => {
      await Promise.all([
        db.sessions.clear(),
        db.sets.clear(),
        db.readiness.clear(),
        db.combines.clear(),
        db.measurements.clear(),
        db.exerciseVideoLog.clear(),
      ]);
    },
  );
}

/**
 * Efface uniquement les photos.
 *
 * Séparé de la remise à zéro de l'historique : ce sont les photos qui pèsent,
 * et il faut pouvoir récupérer de la place sans perdre douze semaines de
 * séries. L'inverse vaut aussi — repartir à zéro sans jeter les photos.
 */
export async function resetPhotos(): Promise<void> {
  await db.transaction(
    'rw',
    [db.progressPhotos, db.exerciseMedia, db.exerciseReference],
    async () => {
      await Promise.all([
        db.progressPhotos.clear(),
        db.exerciseMedia.clear(),
        db.exerciseReference.clear(),
      ]);
    },
  );
}
