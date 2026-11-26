import type { Natura } from '../types'

/**
 * Fixed rules the engine relies on. Each value carries its legal source; values that
 * change every year (INPS) live in InpsParameters below and are user-editable.
 */

/** Revenue ceiling of the regime forfettario, compensi percepiti (L. 190/2014 c. 54, as amended by L. 197/2022). */
export const FORFETTARIO_CEILING_CENTS = 85_000_00

/** Above this amount the regime ends immediately, in the same year (L. 190/2014 c. 71). */
export const FORFETTARIO_IMMEDIATE_EXIT_CENTS = 100_000_00

/** Imposta sostitutiva: 15%, or 5% for the first five years of a new activity (c. 64 and 65). */
export const SUBSTITUTE_TAX_RATE = 15
export const SUBSTITUTE_TAX_STARTUP_RATE = 5
export const STARTUP_YEARS = 5

/** Imposta di bollo on invoices without IVA above €77.47 (DPR 642/1972, Tariffa art. 13; DM 17/06/2014). */
export const BOLLO_AMOUNT_CENTS = 200
export const BOLLO_THRESHOLD_CENTS = 77_47

/**
 * Natura codes for which the engine applies the stamp duty automatically ("auto" mode).
 * N2.2 covers forfettario/minimi invoices; N4 covers exempt operations (art. 10 DPR 633/72).
 * Other cases (e.g. some N3 non-taxable operations) depend on the specific operation, so the
 * invoice editor lets the user force the duty on or off instead of guessing.
 */
export const BOLLO_AUTO_NATURE: readonly Natura[] = ['N2.2', 'N4']

/** Rivalsa INPS for gestione separata (L. 662/1996 art. 1 c. 212): up to 4% charged to the client. */
export const RIVALSA_INPS_RATE = 4

/** Usual ritenuta d'acconto on professional fees (DPR 600/1973 art. 25). */
export const DEFAULT_RITENUTA_RATE = 20

/** Natura used for every line of a forfettario invoice. */
export const FORFETTARIO_NATURA: Natura = 'N2.2'

export const FORFETTARIO_LEGAL_NOTE =
  "Operazione effettuata ai sensi dell'art. 1, commi da 54 a 89, della Legge n. 190/2014 - Regime forfettario"

/** Short version for the FatturaPA RiferimentoNormativo field (max 100 characters). */
export const FORFETTARIO_RIFERIMENTO = 'Art. 1, commi 54-89, L. 190/2014 - Regime forfettario'

export const FORFETTARIO_NO_RITENUTA_NOTE =
  "Compenso non soggetto a ritenuta d'acconto ai sensi dell'art. 1, comma 67, della Legge n. 190/2014"

export const BOLLO_NOTE = "Imposta di bollo assolta in modo virtuale ai sensi dell'art. 6, comma 2, del DM 17/06/2014"

/** Stamp duty passed on to the client is excluded from the IVA base (art. 15 DPR 633/72). */
export const BOLLO_LINE_NATURA: Natura = 'N1'
export const BOLLO_LINE_RIFERIMENTO = 'Escluso art. 15 DPR 633/72'

/**
 * INPS parameters. These change every year (INPS circulars, usually published in
 * January-February). Defaults are the 2025 figures: the app shows them as editable
 * settings and labels the year they come from.
 */
export interface InpsParameters {
  referenceYear: number
  /** Gestione separata rate for professionals with no other pension cover. */
  gestioneSeparataRate: number
  /** Income ceiling (massimale) for gestione separata contributions, in cents. */
  gestioneSeparataMassimaleCents: number
  /** Minimum income (minimale) for artigiani and commercianti, in cents. */
  minimaleCents: number
  artigianiRate: number
  commerciantiRate: number
  /** Fixed contributions due on the minimale (rate × minimale + maternity), in cents. */
  artigianiFixedCents: number
  commerciantiFixedCents: number
  /** Income ceiling for artigiani/commercianti contributions, in cents. */
  ivsMassimaleCents: number
  /** Optional reduction for forfettari enrolled with artigiani/commercianti (L. 190/2014 c. 77). */
  forfettarioReductionPct: number
}

export const DEFAULT_INPS_PARAMETERS: InpsParameters = {
  referenceYear: 2025,
  gestioneSeparataRate: 26.07,
  gestioneSeparataMassimaleCents: 120_607_00,
  minimaleCents: 18_555_00,
  artigianiRate: 24,
  commerciantiRate: 24.48,
  artigianiFixedCents: 4_460_64,
  commerciantiFixedCents: 4_549_70,
  ivsMassimaleCents: 120_607_00,
  forfettarioReductionPct: 35,
}
