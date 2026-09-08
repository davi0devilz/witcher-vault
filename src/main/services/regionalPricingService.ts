import type { RegionalPrice, RegionalPricingRegion, RegionalPricingResult } from '../../shared/models'

const REGIONS: Array<{ region: RegionalPricingRegion; cc: string; flag: string; label: string }> = [
  { region: 'sa', cc: 'sa', flag: '🇸🇦', label: 'السعودية' },
  { region: 'ua', cc: 'ua', flag: '🇺🇦', label: 'أوكرانيا' },
  { region: 'tr', cc: 'tr', flag: '🇹🇷', label: 'تركيا' }
]

interface PriceOverview {
  currency: string
  initial: number
  final: number
  discount_percent: number
}

interface AppDetailsEntry {
  success: boolean
  data?: { is_free?: boolean; price_overview?: PriceOverview }
}

let ratesCache: { fetchedAt: number; rates: Record<string, number> } | null = null
const RATES_TTL_MS = 6 * 60 * 60 * 1000

/**
 * USD-based FX rates, refreshed at most every few hours. Only used to render
 * a SAR-equivalent figure and to display Turkey's Steam price in TRY (Valve
 * bills the Turkish store in USD since 2023) — Steam's own quoted prices are
 * always shown as-is otherwise.
 */
async function getUsdRates(): Promise<Record<string, number> | null> {
  if (ratesCache && Date.now() - ratesCache.fetchedAt < RATES_TTL_MS) return ratesCache.rates

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: controller.signal })
    if (!res.ok) return ratesCache?.rates ?? null
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> }
    if (json.result !== 'success' || !json.rates) return ratesCache?.rates ?? null
    ratesCache = { fetchedAt: Date.now(), rates: json.rates }
    return ratesCache.rates
  } catch {
    return ratesCache?.rates ?? null
  } finally {
    clearTimeout(timeout)
  }
}

function convert(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number | null {
  if (fromCurrency === toCurrency) return amount
  const fromRate = rates[fromCurrency]
  const toRate = rates[toCurrency]
  if (!fromRate || !toRate) return null
  return (amount / fromRate) * toRate
}

async function fetchAppDetailsForRegion(appId: string, cc: string): Promise<AppDetailsEntry['data'] | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&cc=${cc}&l=english`,
      { signal: controller.signal }
    )
    if (!res.ok) return null
    const json = (await res.json()) as Record<string, AppDetailsEntry>
    const entry = json[appId]
    if (!entry?.success || !entry.data) return null
    return entry.data
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Live per-region pricing for Saudi Arabia, Ukraine and Turkey. Never
 * cached to disk — prices and discounts change constantly, and the whole
 * point of this card is showing what Steam quotes right now. Degrades to
 * `available: false` (hidden card) rather than an error whenever a region's
 * data can't be fetched.
 */
export async function getRegionalPricing(appId: string): Promise<RegionalPricingResult> {
  const rates = await getUsdRates()

  const settled = await Promise.all(
    REGIONS.map(async ({ region, cc, flag, label }): Promise<RegionalPrice | null> => {
      const data = await fetchAppDetailsForRegion(appId, cc)
      if (!data) return null

      if (data.is_free) {
        return {
          region,
          countryLabel: label,
          flag,
          currency: '',
          isFree: true,
          initial: null,
          final: null,
          discountPercent: 0,
          sarEquivalent: null,
          approximate: false
        }
      }

      const overview = data.price_overview
      if (!overview) return null

      const nativeInitial = overview.initial / 100
      const nativeFinal = overview.final / 100
      const nativeCurrency = overview.currency

      // Valve prices the Turkish store in USD (not TRY) since 2023 — convert
      // to TRY for display so the card still shows the currency the user asked
      // for, flagged as an approximation rather than Steam's native quote.
      const displayCurrency = region === 'tr' && nativeCurrency !== 'TRY' ? 'TRY' : nativeCurrency
      const approximate = displayCurrency !== nativeCurrency

      let displayInitial = nativeInitial
      let displayFinal = nativeFinal
      let sarEquivalent: number | null = nativeCurrency === 'SAR' ? nativeFinal : null

      if (rates) {
        if (approximate) {
          displayInitial = convert(nativeInitial, nativeCurrency, displayCurrency, rates) ?? nativeInitial
          displayFinal = convert(nativeFinal, nativeCurrency, displayCurrency, rates) ?? nativeFinal
        }
        if (sarEquivalent === null) {
          sarEquivalent = convert(nativeFinal, nativeCurrency, 'SAR', rates)
        }
      }

      return {
        region,
        countryLabel: label,
        flag,
        currency: displayCurrency,
        isFree: false,
        initial: displayInitial,
        final: displayFinal,
        discountPercent: overview.discount_percent,
        sarEquivalent,
        approximate
      }
    })
  )

  const prices = settled.filter((p): p is RegionalPrice => p !== null)
  if (prices.length === 0) return { available: false, isFree: false, prices: [] }

  return { available: true, isFree: prices.every((p) => p.isFree), prices }
}
