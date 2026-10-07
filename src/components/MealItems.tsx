import { useState } from 'react';
import { linesForProduct, type FoodItem, type Meal } from '../data/nutrition';
import { stateLabel, type LibraryFood } from '../data/foodLibrary';
import { FoodSwapSheet } from './FoodSwapSheet';
import {
  CLE_COMPOSITION,
  CLE_QUANTITE,
  MACRO_COHERENCE_TOLERANCE_PCT,
  effectiveItem,
  isEdited,
  itemMacros,
  macroCoherence,
  macrosLookWrong,
  type FoodOverride,
  type Catalogue,
  type FoodOverrides,
} from '../engine/nutrition';
import styles from '../screens/Screens.module.css';

const fr = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/**
 * Les aliments d'un repas, modifiables ligne par ligne.
 *
 * Ce que ça résout : le plan dit « 280 g de skyr nature », mais le skyr de la
 * marque que Guillaume achète n'est pas celui de la table de composition. Sans
 * ça, il faudrait refaire le total à la main à chaque changement de marque —
 * c'est-à-dire ne pas le refaire.
 *
 * Ce que ça N'EST PAS : un journal alimentaire. On ne saisit rien chaque jour,
 * on ne cherche rien dans une base d'aliments, on n'ajoute ni ne retire aucune
 * ligne. La composition du repas vient du .md et n'est pas modifiable ici ; ce
 * qui l'est, ce sont les valeurs d'une ligne qui existe déjà.
 *
 * Les champs sont ceux d'une étiquette de produit — kcal et macros POUR 100 g,
 * quantité à part — pour que Guillaume recopie sans convertir. Une ligne
 * modifiée est marquée, et se remet à l'original d'un bouton : une valeur qu'on
 * ne peut pas annuler est une valeur qu'on n'ose pas changer.
 */
export function MealItems({
  meal,
  overrides,
  customs,
  catalogue,
  onSave,
  onReset,
  onCreateCustom,
}: {
  meal: Meal;
  overrides: FoodOverrides;
  /** Les aliments saisis à la main, proposés au remplacement. */
  customs: LibraryFood[];
  /** La bibliothèque plus les aliments saisis — le même pour tout l'écran. */
  catalogue: Catalogue;
  onSave: (cle: string, patch: FoodOverride) => Promise<void>;
  onReset: (cle: string) => Promise<void>;
  onCreateCustom: (food: LibraryFood) => Promise<void>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!meal.items) return null;

  return (
    <ul className={styles.foodList}>
      {meal.items.map((item) => (
        <FoodLine
          key={item.id}
          item={item}
          overrides={overrides}
          customs={customs}
          catalogue={catalogue}
          open={open === item.id}
          onToggle={() => setOpen((v) => (v === item.id ? null : item.id))}
          onSave={onSave}
          onReset={onReset}
          onCreateCustom={onCreateCustom}
        />
      ))}
    </ul>
  );
}

function FoodLine({
  item,
  overrides,
  customs,
  catalogue,
  open,
  onToggle,
  onSave,
  onReset,
  onCreateCustom,
}: {
  item: FoodItem;
  overrides: FoodOverrides;
  customs: LibraryFood[];
  catalogue: Catalogue;
  open: boolean;
  onToggle: () => void;
  onSave: (cle: string, patch: FoodOverride) => Promise<void>;
  onReset: (cle: string) => Promise<void>;
  onCreateCustom: (food: LibraryFood) => Promise<void>;
}) {
  const courant = effectiveItem(item, overrides, catalogue);
  const macros = itemMacros(item, overrides, catalogue);
  const modifie = isEdited(item, overrides, catalogue);

  /*
   * Le brouillon est en texte, pas en nombre : pendant la frappe un champ passe
   * par « 1 », « 1, », « 1,0 » — des états qu'un number rejetterait ou
   * réécrirait sous le doigt. La conversion a lieu à l'enregistrement.
   */
  const [draft, setDraft] = useState(() => champsDe(courant));
  const [remplacement, setRemplacement] = useState(false);

  /*
   * Le remplacement se range sous la clé de la LIGNE, à côté de la quantité :
   * remplacer le féculent du midi ne doit pas toucher celui du dîner.
   *
   * La quantité n'est pas réécrite ici — `effectiveItem` la conserve, ou repart
   * d'une valeur plausible si l'unité change (180 g de viande ne font pas
   * 180 bananes).
   */
  async function remplacer(productId: string) {
    await onSave(CLE_QUANTITE(item), { productId });
    setRemplacement(false);
    setDraft(champsDe({ ...courant, qty: courant.qty }));
  }

  function ouvrir() {
    setDraft(champsDe(courant));
    onToggle();
  }

  /*
   * Deux enregistrements, deux portées : la quantité sous l'identifiant de la
   * ligne, la composition sous celui du produit. C'est ce qui fait qu'une
   * étiquette de pain se recopie une fois pour les quatre lignes de pain, sans
   * que la quantité du réveil parte s'appliquer à la collation de 16 h.
   *
   * On ne stocke que ce qui DIFFÈRE du .md : une valeur recopiée à l'identique
   * ne doit pas figer la ligne, sinon corriger le plan ne profiterait plus
   * jamais à Guillaume.
   */
  async function enregistrer() {
    const quantite: FoodOverride = {};
    const composition: FoodOverride = {};
    for (const c of CHAMPS) {
      const lu = lireDecimal(draft[c.cle]);
      if (lu === null || lu === item[c.cle]) continue;
      if (c.cle === 'qty') quantite.qty = lu;
      else composition[c.cle] = lu;
    }
    await onSave(CLE_QUANTITE(item), quantite);
    await onSave(CLE_COMPOSITION(item), composition);
    onToggle();
  }

  /*
   * Tout ce qui décrit l'aliment affiché vient de `courant`, c'est-à-dire de
   * l'aliment RÉELLEMENT mangé. Après un remplacement, la ligne doit dire
   * « Saumon » et non « Viande ou poisson » avec les macros du saumon — ce
   * qu'elle faisait, parce qu'elle lisait `item`, l'aliment du plan.
   *
   * Seul le rappel « D'origine… », en bas, garde `item` : c'est sa raison
   * d'être.
   */
  const autresLignes = linesForProduct(courant.product).length - 1;

  /*
   * Contrôle en direct pendant la saisie : les kcal tapées doivent valoir ce que
   * valent les macros tapées. C'est le seul moyen de repérer une étiquette lue
   * de travers sans avoir à juger l'aliment lui-même — l'appli ne sait pas ce
   * que Guillaume mange, mais elle sait qu'un nombre en contredit trois autres.
   */
  const brouillon = {
    kcal: lireDecimal(draft.kcal) ?? item.kcal,
    proteinG: lireDecimal(draft.proteinG) ?? item.proteinG,
    carbsG: lireDecimal(draft.carbsG) ?? item.carbsG,
    fatG: lireDecimal(draft.fatG) ?? item.fatG,
  };
  const coherence = macroCoherence(brouillon);
  const incoherent =
    coherence !== null && Math.abs(coherence.ecartPct) > MACRO_COHERENCE_TOLERANCE_PCT;
  const ligneDouteuse = macrosLookWrong(item, overrides);
  const unite = courant.unit === 'unité' ? (courant.qty > 1 ? 'unités' : 'unité') : courant.unit;
  const base = courant.per === 1 ? 'par unité' : 'pour 100 g';

  return (
    <li className={styles.foodItem}>
      <button type="button" className={styles.foodRow} onClick={ouvrir} aria-expanded={open}>
        <span className={styles.foodName}>
          {courant.label}
          {modifie && (
            <span className={styles.foodBadge} title="Valeur modifiée">
              modifié
            </span>
          )}
          {/*
            Deux badges, deux sens. « modifié » veut dire « tu as changé ça »,
            et c'est lui que compte le bouton de remise à zéro. « deload » dit
            que c'est le programme qui a allégé la portion cette semaine : il
            n'y a rien à réinitialiser, et confondre les deux ferait proposer
            d'annuler un ajustement qui n'est pas de lui.
          */}
          {courant.adjusted === 'deloadLight' && (
            <span
              className={`${styles.foodBadge} ${styles.foodBadgePhase}`}
              title="Portion allégée pour la semaine de deload"
            >
              deload
            </span>
          )}
          {ligneDouteuse && (
            <span
              className={`${styles.foodBadge} ${styles.foodBadgeAlerte}`}
              title="Les kcal et les macros de cette ligne ne concordent pas"
            >
              à vérifier
            </span>
          )}
        </span>
        <span className={`${styles.foodQty} tnum`}>
          {fr(courant.qty)} {unite}
          {/* « cuit » / « cru » dit sur la ligne elle-même : c'est là qu'on
              pèse, et là qu'une confusion coûte le triple des calories. */}
          {stateLabel(courant.referenceState) && (
            <span className={styles.foodState}> {stateLabel(courant.referenceState)}</span>
          )}
        </span>
        <span className={`${styles.foodKcal} tnum`}>{Math.round(macros.kcal)} kcal</span>
      </button>

      {open && (
        <div className={styles.foodEdit}>
          <p className={styles.fieldHint} style={{ margin: '0 0 10px' }}>
            Recopie l’étiquette de ton produit. Les macros sont <b>{base}</b>, la quantité est à
            part — comme sur l’emballage.
          </p>
          {courant.hint && (
            <p className={styles.fieldHint} style={{ margin: '0 0 10px' }}>
              {courant.hint}
            </p>
          )}
          {autresLignes > 0 && (
            <p className={styles.fieldHint} style={{ margin: '0 0 10px' }}>
              La composition vaut pour <b>toutes les lignes « {courant.label} » du plan</b> ({autresLignes}{' '}
              autre{autresLignes > 1 ? 's' : ''}) — une étiquette se recopie une seule fois. La
              quantité, elle, ne concerne que cette ligne.
            </p>
          )}
          <button
            type="button"
            className={styles.secondary}
            style={{ marginBottom: 12 }}
            onClick={() => setRemplacement(true)}
          >
            ↔ Remplacer cet aliment
          </button>

          <div className={styles.foodGrid}>
            {CHAMPS.map((c) => (
              <label key={c.cle} className={styles.foodField}>
                {/* La base (« pour 100 g ») est dite une fois au-dessus : la
                    répéter sur chaque étiquette les faisait passer à la ligne. */}
                <span className={styles.foodFieldLabel}>
                  {c.cle === 'qty' ? `Quantité · ${unite}` : c.label}
                </span>
                <input
                  className={styles.input}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={draft[c.cle]}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.cle]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          {incoherent && coherence && (
            <p className={`${styles.alert} ${styles.alertRouge}`} style={{ margin: '12px 0 0' }}>
              <b>Ces nombres ne peuvent pas décrire le même aliment.</b> Tes macros
              ({fr(brouillon.proteinG)} P · {fr(brouillon.carbsG)} G · {fr(brouillon.fatG)} L)
              valent <b>{Math.round(coherence.attendues)} kcal</b> {base}, pas{' '}
              {fr(brouillon.kcal)}. Sur une étiquette, les kcal sont toujours 4 × protéines
              + 4 × glucides + 9 × lipides. Recopie les quatre nombres de la même colonne, celle
              {courant.per === 1 ? ' de la portion' : ' des 100 g'}.
            </p>
          )}
          <div className={styles.foodActions}>
            <button type="button" className={styles.primary} onClick={() => void enregistrer()}>
              Enregistrer
            </button>
            {modifie && (
              <button
                type="button"
                className={styles.secondary}
                onClick={() =>
                  void (async () => {
                    await onReset(CLE_QUANTITE(item));
                    await onReset(CLE_COMPOSITION(item));
                    onToggle();
                  })()
                }
              >
                Valeur d’origine
              </button>
            )}
          </div>
          {modifie && (
            <p className={styles.fieldHint}>
              D’origine : {item.label}, {fr(item.qty)}{' '}
              {item.unit === 'unité' ? 'unité' : item.unit} · {fr(item.kcal)} kcal ·{' '}
              {fr(item.proteinG)} P · {fr(item.carbsG)} G · {fr(item.fatG)} L ({base}).
            </p>
          )}
        </div>
      )}

      {remplacement && (
        <FoodSwapSheet
          item={courant}
          customs={customs}
          onPick={(id) => void remplacer(id)}
          onCreate={(f) => void onCreateCustom(f)}
          onClose={() => setRemplacement(false)}
        />
      )}
    </li>
  );
}

type Cle = 'qty' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG';

const CHAMPS: Array<{ cle: Cle; label: string }> = [
  { cle: 'qty', label: 'Quantité' },
  { cle: 'kcal', label: 'kcal' },
  { cle: 'proteinG', label: 'Protéines' },
  { cle: 'carbsG', label: 'Glucides' },
  { cle: 'fatG', label: 'Lipides' },
];

const champsDe = (i: FoodItem): Record<Cle, string> => ({
  qty: fr(i.qty),
  kcal: fr(i.kcal),
  proteinG: fr(i.proteinG),
  carbsG: fr(i.carbsG),
  fatG: fr(i.fatG),
});

/**
 * Lit un nombre saisi au clavier français, virgule comprise.
 *
 * Champ vide ou illisible = `null`, donc « ne touche à rien » : écrire 0 à la
 * place ferait disparaître un aliment sur une faute de frappe.
 */
export function lireDecimal(texte: string): number | null {
  const t = texte.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
