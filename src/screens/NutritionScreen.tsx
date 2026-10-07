import { useEffect, useState, useMemo } from 'react';
import { LineChart, type Series } from '../components/Chart';
import { Stepper, stepValue } from '../components/Stepper';
import {
  HYDRATION_NOTE,
  NUTRITION_TARGETS,
  SHOPPING_LIST,
  SIMPLE_RULES,
  SUPPLEMENTS_NOTE,
  TARGET_GAIN_KG_PER_WEEK,
  type DayKind,
} from '../data/nutrition';
import type { DayIndex, WeekIndex } from '../data/types';
import { humanDate } from '../engine/calendar';
import { fr } from '../engine/format';
import {
  consumedTotal,
  fuelForToday,
  gapVerdict,
  mealMacros,
  mealsGap,
  mealsTotal,
  phaseForDay,
  remainingTotal,
  targetForPhase,
  type FoodOverrides,
  starchToCloseGap,
  latestWaist,
  nutritionAdvice,
  weeklyAverages,
  weightTrend,
  type Measurement,
} from '../engine/nutrition';
import {
  allCustomFoods,
  allFoodOverrides,
  clearMealsEatenOn,
  mealsEatenOn,
  saveCustomFood,
  setMealEaten,
  allMeasurements,
  getMeasurement,
  resetFoodOverrides,
  saveFoodOverride,
  saveMeasurement,
} from '../db/repo';
import { MealItems } from '../components/MealItems';
import { FOOD_LIBRARY, type LibraryFood } from '../data/foodLibrary';
import { DELOAD_BANNER, MEALS_GAP_TOLERANCE_PCT } from '../data/nutrition';
import { MacroBar } from '../components/MacroBar';
import { MacroProgress } from '../components/MacroProgress';
import { shareOfDay } from '../engine/macroBar';
import styles from './Screens.module.css';

/**
 * Onglet Nutrition.
 *
 * Trois choses, dans cet ordre : ce que je dois manger aujourd'hui, ce que le
 * suivi me dit d'ajuster, et le détail qu'on ne relit qu'en faisant les courses.
 *
 * Ce n'est volontairement PAS un journal alimentaire. Pas de saisie repas par
 * repas, pas de base d'aliments : des applications gratuites font ça mieux, et
 * remplir un journal trois fois par jour ne tient pas un trimestre avec un
 * métier et deux enfants. La seule saisie ici est la pesée du matin, qui prend
 * cinq secondes et qui est la seule donnée qui pilote réellement le plan.
 */
export function NutritionScreen({
  todayKind,
  todayDay,
  todayWeek,
}: {
  todayKind: DayKind;
  /** Jour de programme de la séance du jour, `null` si repos. */
  todayDay: DayIndex | null;
  /** Semaine de programme du jour, `null` hors programme. */
  todayWeek: WeekIndex | null;
}) {
  const [rows, setRows] = useState<Measurement[] | null>(null);
  const [overrides, setOverrides] = useState<FoodOverrides>({});
  /** Les aliments saisis à la main, proposés au remplacement. */
  const [customs, setCustoms] = useState<LibraryFood[]>([]);
  /** Les repas cochés comme pris aujourd'hui, par identifiant. */
  const [pris, setPris] = useState<ReadonlySet<string>>(new Set());
  const [kind, setKind] = useState<DayKind>(todayKind);
  const [todayRow, setTodayRow] = useState<{ weightKg: number | null; waistCm: number | null }>({
    weightKg: null,
    waistCm: null,
  });

  const todayIso = new Date().toISOString().slice(0, 10);

  async function reload() {
    const all = await allMeasurements();
    setRows(all.map((r) => ({ date: r.date, weightKg: r.weightKg, waistCm: r.waistCm })));
    setOverrides(await allFoodOverrides());
    setCustoms(await chargerCustoms());
    setPris(await mealsEatenOn(todayIso));
    const t = await getMeasurement(todayIso);
    setTodayRow({ weightKg: t?.weightKg ?? null, waistCm: t?.waistCm ?? null });
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Le catalogue consulté par TOUS les calculs de l'écran : la bibliothèque
   * livrée, plus les aliments saisis à la main. Sans ce passage, un repas où un
   * aliment personnalisé a été mis retomberait sur celui du plan au moment du
   * total, et l'écran afficherait deux chiffres contradictoires.
   *
   * Déclaré AVANT le retour de chargement : un hook placé après un `return`
   * n'est pas appelé à tous les rendus, et React s'arrête net (erreur 310).
   */
  const catalogue = useMemo(
    () => ({ ...FOOD_LIBRARY, ...Object.fromEntries(customs.map((f) => [f.id, f])) }),
    [customs],
  );

  if (!rows) return <div className={styles.loading}>Chargement…</div>;

  /*
   * La phase de la journée — ce que la périodisation change dans l'assiette.
   *
   * Elle s'applique aux DEUX paliers : en semaine de deload, le jour de repos
   * baisse aussi, simplement deux fois moins. Chaque palier porte ses propres
   * quantités allégées, donc le même appel suffit pour les deux.
   */
  const phase = phaseForDay(todayWeek, todayDay);
  const target = targetForPhase(NUTRITION_TARGETS[kind], phase);
  const totalRepas = mealsTotal(target, overrides, catalogue);
  const ecart = mealsGap(target, overrides, catalogue);
  const verdict = gapVerdict(target, overrides, MEALS_GAP_TOLERANCE_PCT, catalogue);
  /*
   * Ce qui a été pris, et ce qu'il reste. Calculés sur le palier CONSULTÉ, et
   * la carte ne s'affiche que lorsqu'il est celui du jour : comparer ce qu'on a
   * mangé à la journée type de l'autre palier ne voudrait rien dire.
   */
  const consomme = consumedTotal(target, pris, overrides, catalogue);
  /*
   * La référence est le plan PRESCRIT, sans les corrections de Guillaume.
   *
   * Avec elles, la cible monterait en même temps que l'assiette : peser 900 g
   * de riz au lieu de 250 ferait monter le « prévu » d'autant, et la barre
   * afficherait 100 % quoi qu'il arrive. Un dépassement ne se verrait jamais.
   *
   * La phase, elle, EST dans la référence : une semaine de deload prescrit
   * moins, et c'est à ce moins-là qu'on se compare.
   */
  const prevu = mealsTotal(target);
  const restant = remainingTotal(prevu, consomme);
  /*
   * Le carburant parle du JOUR, pas du palier consulté : basculer le sélecteur
   * pour regarder l'autre journée type ne doit pas faire croire que la séance
   * a changé. La carte reste donc sur aujourd'hui.
   */
  const carburant = fuelForToday(todayDay);
  const baseAujourdhui = mealsTotal(
    targetForPhase(NUTRITION_TARGETS[todayKind], phase),
    overrides,
    catalogue,
  );
  const trend = weightTrend(rows, todayIso);
  const advice = nutritionAdvice(rows, todayIso);
  const waist = latestWaist(rows);

  // 8 fenêtres : la courbe montre presque deux mois, assez pour lire une pente.
  const points = weeklyAverages(rows, todayIso, 8)
    .filter((p) => p.average !== null)
    .reverse();
  const series: Series[] = [
    {
      label: 'Moyenne 7 jours',
      color: 'var(--accent)',
      points: points.map((p, i) => ({ x: i, y: p.average! })),
    },
  ];
  // « 14/8 » plutôt que « 14 » : sur deux mois de courbe, le seul numéro de
  // jour redevient ambigu dès qu'on repasse par un 1er.
  const xLabels = Object.fromEntries(
    points.map((p, i) => {
      const [, month, day] = p.endDate.split('-');
      return [i, `${Number(day)}/${Number(month)}`];
    }),
  );

  async function patchToday(patch: { weightKg?: number | null; waistCm?: number | null }) {
    await saveMeasurement(todayIso, patch);
    await reload();
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Nutrition</h1>
        <p className={styles.lead}>
          Perte de graisse sans privation : protéines élevées, glucides autour de la séance.
          Cinq prises par jour, calées sur les coupures du chantier. Touche un aliment pour
          corriger son étiquette ou le remplacer.
        </p>
      </header>

      {/*
        Bandeau de deload — discret, et seulement quand il a quelque chose à
        dire. Il explique un chiffre qui a bougé tout seul : sans lui, les
        portions allégées ressembleraient à un bug.
      */}
      {phase === 'deloadLight' && (
        <div className={styles.phaseNote}>
          <b>{DELOAD_BANNER.title}</b>
          <span>{DELOAD_BANNER.text}</span>
        </div>
      )}

      {/* --- 1. Référence du jour ------------------------------------------ */}
      <section className={styles.card}>
        {/*
          Les quatre nombres de cette carte sont la SOMME DES REPAS, pas la
          cible écrite à côté. Tant que rien n'est modifié, les deux coïncident
          — c'est le cas ici, à une douzaine de kcal près. Mais dès qu'une
          étiquette est recopiée ou un aliment remplacé, c'est le total réel
          qui doit s'afficher en grand, pas une intention qui ne correspondrait
          plus à ce qui est mangé.
        */}
        <div className={styles.keyStat}>
          <div className={styles.keyStatValue}>
            {totalRepas.kcal.toLocaleString('fr-FR')}
            <span className={styles.keyStatUnit}> kcal / jour</span>
          </div>
          {/*
            Le libellé dit ce que le nombre EST. Il annonçait « ta cible » au
            dessus d'un total qui, dès le premier remplacement, n'est plus la
            cible — l'écart à la cible est dit juste en dessous, chiffré.
          */}
          <div className={styles.keyStatLabel}>
            {kind === todayKind ? 'Ce que tes repas totalisent' : 'Autre palier'} · {target.label}
          </div>
        </div>
        {/* Même ordre que la barre juste en dessous — glucides, protéines,
            lipides. Deux ordres différents pour la même information se lisent
            comme deux informations. */}
        <div className={styles.macros}>
          <div className={styles.macro}>
            <b>{totalRepas.carbsG} g</b>
            <span>Glucides</span>
          </div>
          <div className={styles.macro}>
            <b>{totalRepas.proteinG} g</b>
            <span>Protéines</span>
          </div>
          <div className={styles.macro}>
            <b>{totalRepas.fatG} g</b>
            <span>Lipides</span>
          </div>
        </div>
        {/* De quoi la journée est faite : les trois nombres ci-dessus disent
            des grammes, la barre dit des proportions. Un gramme de lipide pèse
            plus du double d'un gramme de glucide, donc les deux ne se déduisent
            pas l'un de l'autre. */}
        <MacroBar macros={totalRepas} labels="parts" />
        <p className={styles.fieldHint}>{target.note}</p>
      </section>

      {/* --- 2. Où en est la journée ---------------------------------------- */}
      {kind === todayKind && (
        <section className={styles.card}>
          <div className={styles.suiviHead}>
            <h2 className={styles.cardTitle}>Aujourd’hui</h2>
            {pris.size > 0 && (
              <button
                type="button"
                className={styles.suiviReset}
                onClick={() =>
                  void (async () => {
                    await clearMealsEatenOn(todayIso);
                    setPris(await mealsEatenOn(todayIso));
                  })()
                }
              >
                Tout décocher
              </button>
            )}
          </div>
          {/*
            Le grand chiffre est ce qui RESTE, pas ce qui a été pris : c'est la
            question qu'on se pose en ouvrant l'appli à 16 h. Un dépassement
            s'affiche comme tel plutôt qu'en négatif, qui se lit mal d'un
            coup d'œil.
          */}
          <div className={styles.keyStat}>
            <div className={styles.keyStatValue}>
              {Math.abs(restant.kcal).toLocaleString('fr-FR')}
              <span className={styles.keyStatUnit}>
                {restant.kcal < 0 ? ' kcal de trop' : ' kcal restantes'}
              </span>
            </div>
            <div className={styles.keyStatLabel}>
              {consomme.kcal.toLocaleString('fr-FR')} kcal pris sur{' '}
              {prevu.kcal.toLocaleString('fr-FR')} · {pris.size} repas sur{' '}
              {target.meals.length}
            </div>
          </div>
          <MacroProgress consumed={consomme} planned={prevu} />
          <p className={styles.fieldHint}>
            Coche un repas quand tu l’as pris. Ce qui est compté, ce sont tes
            quantités et tes remplacements — rien à ressaisir.
          </p>
        </section>
      )}

      {/* --- Carburant du jour : une recommandation, jamais un ajout auto --- */}
      <section className={`${styles.card} ${styles.fuelCard} ${styles[`fuel_${carburant.level}`]}`}>
        <div className={styles.fuelHead}>
          <span className={styles.fuelDot} aria-hidden="true">
            {carburant.emoji}
          </span>
          <span>
            <b className={styles.fuelTitle}>{carburant.title}</b>
            <span className={styles.fuelSubtitle}>{carburant.subtitle}</span>
          </span>
        </div>

        {carburant.foods.length > 0 && (
          <>
            <ul className={styles.fuelFoods}>
              {carburant.foods.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div className={styles.fuelAmounts}>
              <span className="tnum">{carburant.kcalLabel}</span>
              <span className="tnum">{carburant.carbsLabel}</span>
            </div>
            {/*
              Les trois lignes séparées que Guillaume a demandées : le bonus ne
              doit jamais se fondre dans le plan de base.
            */}
            <dl className={styles.fuelTotals}>
              <dt>Plan de base</dt>
              <dd className="tnum">≈ {baseAujourdhui.kcal.toLocaleString('fr-FR')} kcal</dd>
              <dt>Bonus séance</dt>
              <dd className="tnum">≈ +{carburant.kcal} kcal</dd>
              <dt>Total avec bonus</dt>
              <dd className="tnum">
                ≈ {(baseAujourdhui.kcal + carburant.kcal).toLocaleString('fr-FR')} kcal
              </dd>
            </dl>
          </>
        )}

        <p className={styles.fuelMessage}>{carburant.message}</p>
        {carburant.foods.length > 0 && (
          <p className={styles.fieldHint}>
            Une recommandation, pas une obligation : tu la prends selon ta faim, ta fatigue et
            l’évolution de ton poids. Protéines et lipides ne bougent jamais.
          </p>
        )}
      </section>

      {/* --- 4. Suggestion d'ajustement ------------------------------------ */}
      {advice.kind !== 'none' && (
        <p
          className={`${styles.alert} ${advice.kind === 'add' ? styles.alertVert : styles.alertRouge}`}
        >
          <b>{advice.title}.</b> {advice.action}
        </p>
      )}

      {/* --- Sélecteur des deux paliers ------------------------------------ */}
      <div className={styles.segment} role="group" aria-label="Palier alimentaire">
        {(['train', 'rest'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`${styles.segmentButton} ${kind === k ? styles.segmentOn : ''}`}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
          >
            {NUTRITION_TARGETS[k].label}
          </button>
        ))}
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Repas types</h2>
        <div className={styles.mealList}>
          {target.meals.map((m) => {
            /* Calculé une fois : la ligne de kcal et la barre doivent parler du
               même repas, remplacements et étiquettes corrigées compris. */
            const macros = mealMacros(m, overrides, catalogue);
            return (
            <div key={m.name} className={styles.meal}>
              <div className={styles.mealBody}>
                <div className={styles.mealName}>{m.name}</div>
                {/* De quoi ce repas est fait, et ce qu'il pèse dans la journée.
                    Le résumé d'abord, le détail en dessous — et après un
                    remplacement d'aliment, la barre bouge sous les yeux. */}
                <MacroBar macros={macros} />
                {/*
                  La phrase du .md disparaît dès que le repas est décomposé :
                  elle dit « 280 g de skyr » alors que la ligne en dessous peut
                  dire 400 g. Deux versions du même repas à l'écran, c'est
                  exactement l'incohérence qu'on vient de chasser des totaux.
                */}
                {!m.items && <div className={styles.mealDetail}>{m.detail}</div>}
                {/*
                  Un repas décomposé affiche ses aliments : le détail écrit
                  reste au-dessus comme rappel du plan, la liste en dessous est
                  ce qui compte vraiment et ce qui se modifie.
                */}
                <MealItems
                  meal={m}
                  overrides={overrides}
                  customs={customs}
                  catalogue={catalogue}
                  onSave={async (foodId, patch) => {
                    await saveFoodOverride(foodId, patch);
                    setOverrides(await allFoodOverrides());
                  }}
                  onReset={async (foodId) => {
                    await resetFoodOverrides(foodId);
                    setOverrides(await allFoodOverrides());
                  }}
                  onCreateCustom={async (food) => {
                    await saveCustomFood({
                      foodId: food.id,
                      label: food.label,
                      unit: food.unit,
                      per: food.per,
                      kcal: food.kcal,
                      proteinG: food.proteinG,
                      carbsG: food.carbsG,
                      fatG: food.fatG,
                      referenceState: food.referenceState,
                      category: food.category,
                      addedAt: new Date().toISOString().slice(0, 10),
                    });
                    setCustoms(await chargerCustoms());
                  }}
                />
              </div>
              {/* Les deux nombres qui disent ce que ce repas PÈSE, ensemble :
                  ses calories, et sa part de la journée. */}
              <div className={`${styles.mealKcal} tnum`}>
                <div>{macros.kcal} kcal</div>
                <div className={styles.mealPart}>
                  {shareOfDay(macros.kcal, totalRepas.kcal)} %
                </div>
              </div>
              {/*
                La coche n'apparaît que sur le palier du jour : cocher un repas
                de la journée type qu'on n'est pas en train de vivre ne veut
                rien dire. Une cible de 48 px, comme tout ce qui se touche.
              */}
              {kind === todayKind && (
                <button
                  type="button"
                  className={styles.mealTick}
                  aria-pressed={pris.has(m.id)}
                  aria-label={`${m.name} — ${pris.has(m.id) ? 'pris' : 'pas encore pris'}`}
                  onClick={() =>
                    void (async () => {
                      await setMealEaten(todayIso, m.id, !pris.has(m.id));
                      setPris(await mealsEatenOn(todayIso));
                    })()
                  }
                >
                  {/* Le bouton fait 48 px pour le pouce, le cercle 26 pour
                      l'œil : une pastille de la taille de la cible tactile
                      écraserait le nom du repas à côté. */}
                  <span
                    className={`${styles.mealTickDot} ${
                      pris.has(m.id) ? styles.mealTickOn : ''
                    }`}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                </button>
              )}
            </div>
            );
          })}
        </div>
        {/*
          On affiche la SOMME des repas listés, pas la cible. Les deux coïncident
          à une douzaine de kcal près dans ce plan-ci, mais montrer la cible sous
          une liste qui ne l'atteindrait pas laisserait croire que manger ces
          cinq repas suffit. C'est la somme qui fait foi.
        */}
        {Object.keys(overrides).length > 0 && (
          <button
            type="button"
            className={styles.secondary}
            style={{ width: '100%', margin: '10px 0 0' }}
            onClick={() =>
              void (async () => {
                await resetFoodOverrides();
                setOverrides(await allFoodOverrides());
              })()
            }
          >
            Réinitialiser aux valeurs par défaut ({Object.keys(overrides).length})
          </button>
        )}
        <div className={styles.mealTotal}>
          <span>Total des repas listés</span>
          <span className="tnum">
            ≈ {totalRepas.kcal.toLocaleString('fr-FR')} kcal · {totalRepas.proteinG} g
          </span>
        </div>
        {/*
          Le SENS de l'écart décide du message, pas seulement sa taille. Avant,
          l'alerte disait « il manque N kcal » dans les deux cas, en prenant la
          valeur absolue : un excédent s'annonçait comme un manque, et le conseil
          proposait d'ajouter du féculent à quelqu'un qui en avait déjà trop.
        */}
        {verdict === 'deficit' && (
          <p className={`${styles.alert} ${styles.alertRouge}`} style={{ margin: '12px 0 0' }}>
            <b>
              Il manque {Math.abs(ecart.kcal).toLocaleString('fr-FR')} kcal pour atteindre la cible
              de {target.kcal.toLocaleString('fr-FR')}.
            </b>{' '}
            Ces portions te font manger {fr(Math.abs(ecart.pct))} % de <b>moins</b> que prévu — à ce
            niveau tu risques de perdre du muscle et de craquer. Il faudrait environ{' '}
            {starchToCloseGap(ecart.kcal).toLocaleString('fr-FR')} g de féculent cuit en plus sur la
            journée.
          </p>
        )}
        {verdict === 'surplus' && (
          <p className={styles.alert} style={{ margin: '12px 0 0' }}>
            <b>
              Tu dépasses la cible de {ecart.kcal.toLocaleString('fr-FR')} kcal
              {' '}({target.kcal.toLocaleString('fr-FR')} visées).
            </b>{' '}
            Ces portions te font manger {fr(Math.abs(ecart.pct))} % de <b>plus</b> que prévu — au-delà
            de la cible, ta perte de graisse ralentit. Il faudrait retirer environ{' '}
            {starchToCloseGap(ecart.kcal).toLocaleString('fr-FR')} g de féculent cuit sur la journée.
            Vérifie aussi les lignes marquées « modifié » : une étiquette mal recopiée se voit ici
            avant de se voir sur la balance.
          </p>
        )}
        {verdict === 'ok' && (
          <p className={styles.fieldHint}>
            Ajuste les féculents de ±30 g selon la faim et ta moyenne hebdomadaire. Les quantités
            sont des repères, pas des lois.
          </p>
        )}
      </section>

      {/* --- 2 et 3. Suivi de poids et tour de taille ----------------------- */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Pesée du matin</h2>
        <p className={styles.cardSub}>
          Au réveil, avant de manger ou de boire. Idéalement 4 à 7 fois par semaine — mais une seule
          fois suffit à faire tourner la moyenne.
        </p>
        <div className={styles.field}>
          <Stepper
            label={`Poids — ${humanDate(todayIso)}`}
            value={todayRow.weightKg}
            step={0.1}
            min={40}
            max={160}
            unit="kg"
            tone="accent"
            onStep={(d) =>
              void patchToday({ weightKg: stepValue(todayRow.weightKg, d, 40, 160) })
            }
            onCommit={(v) => void patchToday({ weightKg: v })}
          />
        </div>
        <div className={styles.field}>
          <Stepper
            label="Tour de taille"
            value={todayRow.waistCm}
            step={0.5}
            min={60}
            max={170}
            unit="cm"
            onStep={(d) => void patchToday({ waistCm: stepValue(todayRow.waistCm, d, 60, 150) })}
            onCommit={(v) => void patchToday({ waistCm: v })}
          />
          <p className={styles.fieldHint}>
            Toutes les 1 à 2 semaines, même repère et même moment. S’il baisse, tu perds bien de la
            graisse, même les semaines où la balance stagne.
          </p>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Moyenne 7 jours</h2>
        <p className={styles.cardSub}>
          Une pesée isolée bouge de 1 à 2 kg selon l’hydratation, le sel de la veille, le transit.
          Seule la moyenne veut dire quelque chose.
        </p>
        <div className={styles.keyStat}>
          <div className={styles.keyStatValue}>
            {trend.average7 === null ? '—' : `${fr(trend.average7)}`}
            <span className={styles.keyStatUnit}> kg</span>
          </div>
          <div className={styles.keyStatLabel}>
            {trend.average7 === null
              ? 'Saisis ta première pesée pour lancer le suivi.'
              : trend.deltaKg === null
                ? `${trend.countThisWeek} pesée${trend.countThisWeek > 1 ? 's' : ''} cette semaine. Il faut une semaine de plus pour comparer.`
                : `${trend.deltaKg > 0 ? '+' : ''}${fr(trend.deltaKg)} kg vs la semaine précédente · ${trend.countThisWeek} pesée${trend.countThisWeek > 1 ? 's' : ''}`}
          </div>
        </div>
        {trend.deltaKg !== null && (
          <p className={styles.fieldHint} style={{ color: trend.onTarget ? 'var(--vert)' : undefined }}>
            {trend.onTarget
              ? `Dans la fourchette visée (${fr(TARGET_GAIN_KG_PER_WEEK.max)} à ${fr(TARGET_GAIN_KG_PER_WEEK.min)} kg par semaine).`
              : `Fourchette visée : ${fr(TARGET_GAIN_KG_PER_WEEK.max)} à ${fr(TARGET_GAIN_KG_PER_WEEK.min)} kg par semaine. Plus vite, tu perdrais du muscle et tu préparerais l’effet yo-yo.`}
          </p>
        )}
        {waist !== null && (
          <p className={styles.fieldHint}>
            Dernier tour de taille : <b>{fr(waist)} cm</b>.
          </p>
        )}
        <LineChart
          series={series}
          xLabels={xLabels}
          unit="kg"
          emptyMessage="Pas encore assez de pesées pour tracer une tendance."
        />
      </section>

      {/* --- Le détail, replié ---------------------------------------------- */}
      <details className={styles.details}>
        <summary className={styles.summary}>Liste de courses</summary>
        <div className={styles.detailsBody}>
          {SHOPPING_LIST.map((g) => (
            <p key={g.title}>
              <b>{g.title}</b> — {g.items}
            </p>
          ))}
        </div>
      </details>

      <details className={styles.details}>
        <summary className={styles.summary}>Règles simples</summary>
        <div className={styles.detailsBody}>
          <ol className={styles.ruleList}>
            {SIMPLE_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </div>
      </details>

      <details className={styles.details}>
        <summary className={styles.summary}>Compléments et hydratation</summary>
        <div className={styles.detailsBody}>
          <p>{SUPPLEMENTS_NOTE}</p>
          <p>{HYDRATION_NOTE}</p>
        </div>
      </details>
    </div>
  );
}

/**
 * Les aliments personnalisés, sous la même forme que ceux de la bibliothèque.
 *
 * C'est ce qui permet au remplacement de les traiter indifféremment : une
 * seule liste, un seul chemin de calcul.
 */
async function chargerCustoms(): Promise<LibraryFood[]> {
  return (await allCustomFoods()).map((r) => ({
    id: r.foodId,
    label: r.label,
    unit: r.unit,
    per: r.per,
    kcal: r.kcal,
    proteinG: r.proteinG,
    carbsG: r.carbsG,
    fatG: r.fatG,
    referenceState: r.referenceState,
    category: r.category as LibraryFood['category'],
    isCustom: true,
  }));
}
