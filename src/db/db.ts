/**
 * Base locale (IndexedDB via Dexie).
 *
 * Tout reste sur le téléphone : pas de compte, pas de serveur. Chaque série
 * validée est écrite immédiatement — l'appli ne doit jamais perdre une saisie.
 */

import Dexie, { type Table } from 'dexie';
import { LEGACY_DAY_MAP, type DayIndex } from '../data/types';

export type SessionStatus = 'planned' | 'done' | 'skipped';

export interface SessionRow {
  id?: number;
  week: number;
  day: DayIndex;
  /** `YYYY-MM-DD`. */
  date: string;
  status: SessionStatus;
  /** Ids des items d'échauffement cochés (§6). */
  warmupChecked: string[];
  /** Douleur, sommeil, remarque — défaut n°9 du prototype. */
  notes: string;
  /**
   * Charge retenue par Guillaume quand il accepte une suggestion de §11, ou
   * qu'il en saisit une autre. Clé = id d'exercice. Le plan reste intact.
   */
  loadOverrides?: Record<string, number>;
  startedAt?: number;
  finishedAt?: number;
}

export interface SetRow {
  id?: number;
  sessionId: number;
  exerciseId: string;
  week: number;
  day: DayIndex;
  date: string;
  setIndex: number;

  plannedKg: number | null;
  plannedReps: number | null;
  /** Cible de RPE du jour, figée au moment de la saisie. */
  targetRpeMin: number | null;
  targetRpeMax: number | null;
  targetRpeLabel: string | null;

  actualKg: number | null;
  actualReps: number | null;
  actualRpe: number | null;
  /**
   * Mesure d'un exercice qui ne se compte ni en reps ni en kilos : distance de
   * saut en cm, temps de sprint en s, distance de carry en m.
   */
  measureValue: number | null;
  /** §11 cas 5. */
  failed: boolean;

  doneAt: number;
}

export interface ReadinessRow {
  id?: number;
  date: string;
  week: number;
  day: DayIndex;
  /** Les 3 essais, pour l'historique. */
  attempts: Array<number | null>;
  /** Meilleur des 3, celui qui sert au verdict. */
  jumpCm: number;
  level: 'vert' | 'orange' | 'rouge';
  pctDelta: number;
}

/**
 * Une ligne par jour de relevé — poids du matin, tour de taille quand il y en a.
 *
 * Table séparée et non un champ de plus dans `settings` : le plan alimentaire
 * ne décide rien sur une pesée isolée, il lui faut un historique. `date` est
 * unique, donc se repeser deux fois le même jour corrige la ligne au lieu d'en
 * créer une deuxième qui fausserait la moyenne.
 */
export interface MeasurementRow {
  id?: number;
  /** `YYYY-MM-DD`. */
  date: string;
  weightKg: number | null;
  waistCm: number | null;
}

/**
 * Photo hebdomadaire du suivi visuel.
 *
 * `week` est unique : une photo par semaine, et en reprendre une remplace la
 * précédente. Douze semaines de photos doivent rester comparables entre elles,
 * pas devenir un album.
 *
 * La photo est stockée en `Blob` déjà compressé (voir `src/media/photo.ts`),
 * jamais en base64 : une chaîne base64 pèse un tiers de plus et doit être
 * décodée à chaque affichage.
 */
export interface ProgressPhotoRow {
  id?: number;
  week: number;
  /** `YYYY-MM-DD` du jour de la prise. */
  date: string;
  blob: Blob;
  /** Taille après compression, pour afficher l'encombrement sans tout relire. */
  bytes: number;
  width: number;
  height: number;
}

/** Photo d'exécution d'un mouvement, prise depuis la fiche d'exercice. */
export interface ExerciseMediaRow {
  id?: number;
  exerciseId: string;
  week: number;
  day: DayIndex;
  date: string;
  blob: Blob;
  bytes: number;
  width: number;
  height: number;
}

/**
 * Fiche technique d'un mouvement — une image, pour toujours.
 *
 * À ne pas confondre avec `exerciseMedia`, et c'est pour ça que ce sont deux
 * tables : celle-ci porte une infographie d'exécution, la même quelle que soit
 * la semaine, donc clé unique sur `exerciseId` et AUCUNE date. L'autre porte
 * des photos de Guillaume à une séance précise, donc datées.
 *
 * Les mélanger obligeait à réattacher la même image à chacune des dix
 * occurrences du back squat sur douze semaines — dix copies du même fichier en
 * base, et neuf gestes inutiles.
 */
export interface ExerciseReferenceRow {
  id?: number;
  exerciseId: string;
  blob: Blob;
  bytes: number;
  width: number;
  height: number;
  /** `YYYY-MM-DD` d'ajout, pour savoir de quand date la fiche. */
  addedAt: string;
}

/**
 * Trace d'une vidéo — et rien d'autre.
 *
 * Le fichier vidéo reste dans la pellicule de l'iPhone. Sur iOS, le stockage
 * d'une PWA peut être vidé par le système quand la place manque ; y mettre des
 * dizaines de vidéos serait une perte de données annoncée. On ne garde donc
 * que la date, de quoi dire « tu as filmé ton squat le 14 septembre ».
 */
export interface ExerciseVideoLogRow {
  id?: number;
  exerciseId: string;
  week: number;
  day: DayIndex;
  date: string;
  /** Note libre : « vue de profil », « 3e série ». */
  note: string;
}

/**
 * Remarque libre sur UN exercice d'UNE séance.
 *
 * À ne pas confondre avec `sessions.notes`, la remarque de fin de séance, qui
 * parle de la séance entière — douleur, sommeil, sensation générale. Celle-ci
 * parle d'un mouvement précis un jour précis : « le squat m'a paru très lourd
 * dès la deuxième série ». C'est le signal qui aurait fait remarquer, dès la
 * semaine 1, que la charge de squat ne correspondait pas au vrai niveau.
 *
 * La clé est `[exerciseId+week+day]`, donc une remarque par exercice et par
 * OCCURRENCE — ni par série (trop fin : on ne se souvient pas série par série),
 * ni par exercice tout court (trop grossier : la remarque de la semaine 3
 * écraserait celle de la semaine 1, qu'on veut justement pouvoir relire).
 */
export interface ExerciseNoteRow {
  id?: number;
  exerciseId: string;
  week: number;
  day: DayIndex;
  /** `YYYY-MM-DD` de la séance, pour dater la remarque à la relecture. */
  date: string;
  text: string;
  /** ms epoch de la dernière frappe. */
  updatedAt: number;
}

export type CombinePhase = 'initial' | 's8' | 'final';

export interface CombineRow {
  id?: number;
  phase: CombinePhase;
  date: string;
  /** Clé = id d'exercice de test, valeur = mesure. */
  metrics: Record<string, number | null>;
  notes: string;
}

export interface SettingsRow {
  id: 1;
  startDate: string;
  broadJumpBaselineCm: number | null;
  oneRM: Record<string, number>;
  /**
   * §12 — « moyenne de 3 matinées, à jeun ». Relevé à la maison sur plusieurs
   * jours, jamais pendant une séance : il vit ici et se saisit à tout moment.
   */
  bodyweightKg: number | null;
  /** Date `YYYY-MM-DD` du dernier relevé de poids, pour dater le rappel. */
  bodyweightDate: string;
  /**
   * Date `YYYY-MM-DD` du dernier recalage des charges sur les 1RM testés.
   *
   * Vide = les charges tournent encore sur les estimations d'avant le combine.
   * Sert à dire à Guillaume à partir de quand le plan affiché repose sur ses
   * vrais maxima — les séances validées avant, elles, restent telles quelles :
   * elles enregistrent ce qu'il a réellement soulevé, pas ce qui était prévu.
   */
  oneRMCalibratedAt: string;
  /** Son et vibration en fin de repos. */
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export class ProgrammeDB extends Dexie {
  sessions!: Table<SessionRow, number>;
  sets!: Table<SetRow, number>;
  readiness!: Table<ReadinessRow, number>;
  combines!: Table<CombineRow, number>;
  measurements!: Table<MeasurementRow, number>;
  progressPhotos!: Table<ProgressPhotoRow, number>;
  exerciseMedia!: Table<ExerciseMediaRow, number>;
  exerciseReference!: Table<ExerciseReferenceRow, number>;
  foodOverrides!: Table<FoodOverrideRow, number>;
  exerciseVideoLog!: Table<ExerciseVideoLogRow, number>;
  exerciseNotes!: Table<ExerciseNoteRow, number>;
  settings!: Table<SettingsRow, number>;

  constructor() {
    super('programme-remuald');
    this.version(1).stores({
      sessions: '++id, &[week+day], date, status',
      sets: '++id, sessionId, [sessionId+exerciseId], exerciseId, [exerciseId+week], date',
      readiness: '++id, date, [week+day], week',
      combines: '++id, &phase, date',
      settings: 'id',
    });

    /*
     * v2 — le 3e jour du combine initial était rangé en (semaine 1, lundi).
     * Il appartient au combine, donc à la semaine 0 : l'onglet « T » doit le
     * montrer avec ses deux frères, et la semaine 1 ne garder que ses séances.
     * Tout ce qui a déjà été saisi ce jour-là suit le déménagement — sinon la
     * séance rouvrirait vide.
     */
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        await tx.table('sessions').where('[week+day]').equals([1, 0]).modify({ week: 0 });
        await tx.table('readiness').where('[week+day]').equals([1, 0]).modify({ week: 0 });
        // `sets` n'a pas d'index sur `week` seul : un parcours complet, une fois.
        await tx
          .table('sets')
          .toCollection()
          .modify((r: { week: number; day: number }) => {
            if (r.week === 1 && r.day === 0) r.week = 0;
          });
      });

    /*
     * v3 — journal de poids et de tour de taille, pour l'onglet Nutrition.
     * Ajout pur : aucune table existante n'est touchée, donc tout l'historique
     * d'entraînement traverse la migration sans y toucher.
     */
    this.version(3).stores({ measurements: '++id, &date' });

    /*
     * v4 — suivi visuel. Trois tables, toujours en ajout pur.
     *
     * Les photos sont dans des tables à part et non dans `sessions` ou
     * `measurements` : ce sont les seules lignes lourdes de la base, et les
     * isoler permet de les exporter, de les compter et au besoin de les
     * effacer sans toucher à une seule série d'entraînement.
     */
    this.version(4).stores({
      progressPhotos: '++id, &week, date',
      exerciseMedia: '++id, exerciseId, [exerciseId+date], week, date',
      exerciseVideoLog: '++id, exerciseId, [exerciseId+date], week, date',
    });

    /*
     * v5 — `DayIndex` passe de cinq jours (lun, mer, ven, sam, dim) aux sept
     * jours réels, pour que le combine initial puisse occuper un mardi et un
     * jeudi. Toutes les lignes déjà enregistrées portent l'ancienne
     * numérotation et doivent être traduites : 0→0, 1→2, 2→4, 3→5, 4→6.
     *
     * L'ordre DÉCROISSANT n'est pas décoratif. `sessions` a un index unique
     * sur `[week+day]` : traduire 1→2 avant d'avoir libéré le 2 ferait entrer
     * deux lignes en collision au milieu du parcours. En partant du jour le
     * plus élevé, la place visée est toujours déjà vide.
     *
     * L'ancre du calendrier change de sens au passage — elle désignait le
     * samedi du combine, elle désigne maintenant son lundi — donc on avance la
     * date enregistrée jusqu'au lundi suivant.
     */
    this.version(5).upgrade(async (tx) => {
      for (const table of ['sessions', 'sets', 'readiness', 'exerciseMedia', 'exerciseVideoLog']) {
        for (const oldDay of [4, 3, 2, 1]) {
          const nouveau = LEGACY_DAY_MAP[oldDay]!;
          await tx
            .table(table)
            .toCollection()
            .modify((row: { day?: number }) => {
              if (row.day === oldDay) row.day = nouveau;
            });
        }
      }

      const settings = await tx.table('settings').get(1);
      if (settings?.startDate) {
        await tx
          .table('settings')
          .update(1, { startDate: mondayOnOrAfter(settings.startDate as string) });
      }
    });

    /*
     * v6 — répare un effet de bord de la v5.
     *
     * La v5 traduit les numéros de jour, ce qui est juste pour une semaine
     * d'entraînement : le lundi reste le lundi, la séance est la même avant et
     * après. Mais la semaine 0 a été entièrement redessinée au même moment —
     * trois séances sont devenues cinq, et leur contenu a changé. Traduire un
     * numéro n'y avait donc aucun sens : un « fait » posé sur l'ancien jour 3
     * (deadlift, lundi) se retrouvait sur la nouvelle séance sauts + squat.
     *
     * Les lignes de la semaine 0 ne décrivent plus rien : on les efface, ainsi
     * que leurs séries. Les résultats du combine, eux, vivent dans la table
     * `combines` (onglet Combine) et ne sont pas touchés — rien d'irremplaçable
     * ne part.
     */
    this.version(6).upgrade(async (tx) => {
      const sessions = (await tx.table('sessions').toArray()) as SessionRow[];
      const week0 = sessions.filter((s) => s.week === 0);
      const ids = new Set(week0.map((s) => s.id));

      await tx
        .table('sets')
        .toCollection()
        .filter((r: SetRow) => r.week === 0 || ids.has(r.sessionId))
        .delete();
      await tx
        .table('readiness')
        .toCollection()
        .filter((r: ReadinessRow) => r.week === 0)
        .delete();
      await tx
        .table('sessions')
        .toCollection()
        .filter((r: SessionRow) => r.week === 0)
        .delete();
    });

    /*
     * v7 — fiche technique par mouvement. Ajout pur, une table de plus.
     *
     * `&exerciseId` est unique : une seule fiche par mouvement. En reprendre
     * une remplace la précédente au lieu d'empiler, ce qui est exactement le
     * comportement attendu d'une fiche de référence.
     */
    this.version(7).stores({ exerciseReference: '++id, &exerciseId' });

    /*
     * v8 — valeurs d'aliment modifiées par Guillaume.
     *
     * Une ligne par aliment MODIFIÉ, pas par aliment du plan : tant qu'il ne
     * touche à rien, la table est vide et c'est le .md qui parle. Supprimer la
     * ligne suffit donc à revenir aux valeurs d'origine, sans avoir à stocker
     * quelque part ce qu'étaient ces valeurs.
     *
     * Chaque champ est optionnel : changer la seule quantité ne fige pas la
     * composition, qui continue de suivre le .md.
     */
    this.version(8).stores({ foodOverrides: '++id, &foodId' });

    /*
     * v9 — remarque par exercice et par séance. Ajout pur, une table de plus :
     * aucune ligne existante n'est lue ni modifiée, tout l'historique traverse
     * la migration sans y toucher.
     *
     * `&[exerciseId+week+day]` est unique — c'est ce qui fait qu'écrire au fil
     * de la frappe corrige la remarque du jour au lieu d'en empiler une par
     * caractère tapé. L'index `exerciseId` sert à relire, à la semaine 7, ce
     * qui avait été noté sur ce mouvement en semaine 1.
     */
    this.version(9).stores({
      exerciseNotes: '++id, &[exerciseId+week+day], exerciseId, [exerciseId+week], date',
    });
  }
}

/**
 * Valeurs d'un aliment telles que Guillaume les a corrigées.
 *
 * `foodId` est l'identifiant stable de `FoodItem`, jamais son libellé : un
 * libellé peut être reformulé sans rien casser, un identifiant non.
 */
export interface FoodOverrideRow {
  id?: number;
  foodId: string;
  qty?: number;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

/** Premier lundi à partir d'une date incluse — conversion d'ancre de la v5. */
function mondayOnOrAfter(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const shift = (8 - d.getUTCDay()) % 7; // 0 si déjà lundi
  return new Date(d.getTime() + shift * 86_400_000).toISOString().slice(0, 10);
}

export const db = new ProgrammeDB();

export const DEFAULT_SETTINGS_ROW: SettingsRow = {
  id: 1,
  startDate: '',
  broadJumpBaselineCm: null,
  oneRM: {},
  bodyweightKg: null,
  bodyweightDate: '',
  oneRMCalibratedAt: '',
  soundEnabled: true,
  vibrationEnabled: true,
};
