/**
 * Meta per-message rate card used to ESTIMATE the WhatsApp cost on the Billing screen.
 *
 * Estimate; confirm against Meta's current rate card at
 * developers.facebook.com/docs/whatsapp/pricing before relying on these numbers. Meta prices
 * each delivered billable message by template category and by the recipient's country (market),
 * and changes the card from time to time. Values are USD **micro-units** (1 USD = 1,000,000) so
 * fractions of a cent add up correctly; the API rounds the monthly total to cents.
 *
 * When the worker stores Meta's real cost in `usage_daily.cost_minor`, that number wins over
 * this estimate.
 */
export const RATE_CURRENCY = 'USD';

export type RateCategory = 'marketing' | 'utility' | 'authentication' | 'service';
export type RateCard = Record<RateCategory, number>;

export const META_RATE_CARD: Record<string, RateCard> = {
  /** Sri Lanka (country code 94). Estimate only; confirm on Meta's rate card. */
  '94': { marketing: 73_200, utility: 11_300, authentication: 11_300, service: 0 },
  /** Used for any market not listed above. Estimate only. */
  default: { marketing: 73_200, utility: 11_300, authentication: 11_300, service: 0 }
};

export function rateFor(countryCode: string, category: string): number {
  const card = META_RATE_CARD[countryCode] ?? META_RATE_CARD.default;
  const key = category.toLowerCase();
  if (key in card) return card[key as RateCategory];
  // Unknown billable categories (for example `marketing_lite`) are priced like marketing.
  return key.startsWith('marketing') ? card.marketing : card.utility;
}

/** Micro-units → cents, rounded. */
export function microToMinor(micro: number): number {
  return Math.round(micro / 10_000);
}
