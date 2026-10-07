# Reporter une amélioration depuis `programme-12-semaines`

Cette appli est née d'une copie de `programme-12-semaines`. Les deux partagent
leur moteur et leurs écrans ; elles ne partagent **rien** de ce qui décrit
l'athlète. Ce fichier dit où passe la frontière, pour qu'un report ne traîne
jamais avec lui le programme de quelqu'un d'autre.

## La règle, en une phrase

> On reporte du **code**. On ne reporte **jamais** de **données**.

## Ce qui se reporte tel quel

Le moteur, le stockage et les écrans — ce qui décide et ce qui affiche, pas ce
qui décrit :

- `src/engine/` sauf les trois fichiers listés plus bas ;
- `src/components/`, `src/screens/`, `src/state/`, `src/timer/`, `src/media/` ;
- `src/db/repo.ts`, `src/db/export.ts` ;
- `src/styles/`, `src/assets/` ;
- `src/media/techniqueImage.ts`, `src/components/TechniqueSheet.*`,
  `scripts/techniqueImagesPlugin.mjs` (le mécanisme des fiches techniques) ;
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `.github/workflows/`.

Un fichier de cette liste qui diffère encore de celui de `programme-12-semaines`
ne diffère que par un commentaire ou un exemple — « Remplacer le féculent »
plutôt que « Remplacer le poulet ». C'est voulu : un commentaire qui parle d'un
aliment absent du plan est un commentaire faux.

## Ce qui ne se reporte jamais

**Les fiches techniques.** Les images de `public/images/exercises/` et les
champs `techniqueImage` de `src/data/exercises.ts` sont propres à chaque appli.

**Le programme lui-même.** `programme-remuald.md` est la source de vérité de
cette appli, et `src/data/` n'en est que la transcription :

- `src/data/exercises.ts`, `baseSessions.ts`, `testSessions.ts`,
  `blockRules.ts`, `mainLiftTable.ts`, `program.ts`, `nutrition.ts` ;
- `src/data/types.ts` pour `TRAINING_DAYS` : quatre séances ici, cinq là-bas.

**Les règles qui dépendent du profil.** Même fichier, décision différente :

- `src/engine/readiness.ts` — trois questions sans saut ici, un feu tricolore
  sur le broad jump là-bas ;
- `src/engine/getSession.ts` — le deload touche aussi les exercices principaux
  ici, faute de tableau de charges ;
- `src/engine/nutrition.ts` — `ADJUST_RULES` surveille une perte trop rapide
  ici, une prise trop rapide là-bas. Tout le reste du fichier se reporte.

**L'identité de l'appli.** Deux applis installées côte à côte sur le même
téléphone : si ces valeurs se croisent, les deux bases de données fusionnent.

- `src/db/db.ts` — nom de la base : `programme-remuald` ;
- `src/state/lastWeek.ts`, `src/timer/restTimer.ts` — préfixe `premuald:` ;
- `index.html`, `vite.config.ts`, `scripts/generate-icons.mjs`, `public/icons/`,
  `README.md`.

**Les tests qui lisent le programme.** Ils vérifient que le code dit la même
chose que le `.md`, donc ils sont propres à chaque programme. Ils se
**réécrivent**, jamais ne se copient : `program.test.ts`, `getSession.test.ts`,
`nutrition.test.ts`, `calendar.test.ts`, `readiness.test.ts`,
`foodSwap.test.ts`, `measureEntry.test.ts`, `measureField.test.ts`,
`historyIndex.test.ts`, `progression.test.ts`, `loadEntry.test.ts`.

## Voir ce qui a divergé

Les deux dépôts côte à côte, puis :

```sh
# les fichiers que l'autre appli a et pas celle-ci
diff <(git -C ../programme-12-semaines ls-files) <(git ls-files)

# l'ampleur de l'écart, fichier par fichier, du plus gros au plus petit
for f in $(git ls-files); do
  [ -f "../programme-12-semaines/$f" ] || continue
  n=$(diff "$f" "../programme-12-semaines/$f" | grep -c '^[<>]')
  [ "$n" -gt 0 ] && printf '%5d  %s\n' "$n" "$f"
done | sort -rn
```

Un fichier de la première liste au-dessus de quelques dizaines de lignes d'écart
est soit une fonctionnalité qui n'est pas encore là, soit une divergence à
examiner. Un fichier de la seconde liste a le droit d'avoir n'importe quel
écart : c'est un autre athlète.

## Après un report

Dans cet ordre, et sans en sauter :

```sh
npm test          # les tests de transcription attrapent une donnée importée par erreur
npm run typecheck
npm run build
```

Puis l'appli dans un navigateur, à 390 px de large. Les tests ne voient pas une
barre qui remonte au milieu de l'écran.
