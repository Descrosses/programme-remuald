# Programme Remuald

Application web installable (PWA) pour suivre le programme de préparation
physique décrit dans [`programme-remuald.md`](programme-remuald.md).

Fonctionne à 100 % hors ligne après la première ouverture. Toutes les données
restent sur l'appareil : pas de compte, pas de serveur, pas de base distante.

## Le principe

Le fichier `programme-remuald.md` décrit le programme. Le code ne le réinterprète pas :

- `src/data/` transcrit le programme, et rien d'autre — aucune logique.
- `src/engine/` contient les fonctions pures qui décident (séance du jour,
  progression, feu tricolore). Aucun React.
- `src/db/` stocke ce qui a réellement été fait.
- `src/screens/` et `src/components/` affichent.

Les tests de `src/data/program.test.ts` vérifient que les séances respectent les consignes du programme (aucun saut, RPE ≤ 8, quatre jours).

## Développement

```bash
npm install
npm run dev        # serveur local
npm test
npm run typecheck
npm run build      # génère dist/ avec le service worker
```

Régénérer les icônes après un changement de couleur :

```bash
node scripts/generate-icons.mjs
```

## Déploiement

Un push sur `main` déclenche [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) :
tests, vérification des types, build, publication sur GitHub Pages. Le `base`
de Vite est déduit du nom du dépôt, donc renommer le dépôt ne casse rien.

## Polices

Barlow Condensed (500 et 700) est embarqué dans `src/assets/fonts/`, jamais
chargé depuis internet : sans réseau dans la salle, la mise en page ne doit pas
changer. Licence SIL Open Font License 1.1, voir `src/assets/fonts/OFL.txt`.

## Limite connue — chrono et verrouillage d'écran

iOS suspend le JavaScript d'une page en arrière-plan et n'offre aucune API de
notification programmée dans le futur. Une alerte sonore à l'instant exact où
le repos se termine, écran verrouillé, n'est donc pas réalisable depuis une
application web sur iPhone.

Deux parades sont en place :

1. **Screen Wake Lock** — l'écran est maintenu allumé pendant le repos. La
   barre de chrono affiche « écran allumé » ou « écran non tenu » pour que ce
   soit vérifiable d'un coup d'œil, en salle.
2. **Horodatage de fin** — le chrono ne décompte pas, il compare à une heure de
   fin stockée. Même si l'appli est tuée puis relancée, le temps affiché au
   retour est juste.

## Parenté avec `programme-12-semaines`

Cette appli est née d'une copie de `programme-12-semaines` : même moteur, mêmes
écrans, autre athlète et autre programme. Les améliorations de l'une se
reportent donc sur l'autre, mais jamais les données.

`SYNC.md` dit où passe la frontière, quels fichiers ne doivent jamais traverser,
et comment mesurer ce qui a divergé entre les deux dépôts.

## Fiches techniques des exercices

Chaque exercice peut afficher sa fiche technique (« 📷 Voir le mouvement »,
ouverte en plein écran).

1. Déposer l'image dans `public/images/exercises/`, au nom indiqué par le champ
   `techniqueImage` de l'exercice dans `src/data/exercises.ts`
   (ex. `goblet-squat.webp`).
2. Pousser sur `main`.

Le bouton apparaît tout seul au déploiement suivant. Tant qu'un fichier manque,
l'exercice n'affiche rien — ni bouton, ni image cassée. Les fiches sont mises
en cache avec le reste de l'appli : elles s'ouvrent aussi sans réseau.

