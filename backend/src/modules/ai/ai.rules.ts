/**
 * Rule-based handoff: phrases that always go to a person, whatever the model says.
 * English, Singlish (romanised Sinhala), Sinhala and Tamil.
 */
export type HandoffRule = 'negotiation' | 'complaint' | 'staff_request';

const WORDS: Record<HandoffRule, string[]> = {
  negotiation: [
    'discount',
    'price drop',
    'reduce the price',
    'lower price',
    'cheaper',
    'best price',
    'last price',
    'final price',
    'bargain',
    'negotiate',
    'adu karanna',
    'adu karaganna',
    'aduwata',
    'adu karala',
    'gana adu',
    'mila adu',
    'discount ekak',
    'අඩු කරන්න',
    'අඩුවට',
    'වට්ටම්',
    'தள்ளுபடி',
    'விலை குறை',
    'குறைக்க'
  ],
  complaint: [
    'complaint',
    'complain',
    'angry',
    'refund',
    'worst',
    'terrible',
    'horrible',
    'bad service',
    'scam',
    'cheated',
    'fraud',
    'disappointed',
    'not happy',
    'unacceptable',
    'broken',
    'damaged',
    'naraka',
    'kenthi',
    'pissu',
    'boru',
    'පැමිණිලි',
    'කේන්ති',
    'නරක',
    'புகார்',
    'கோபம்',
    'மோசம்'
  ],
  staff_request: [
    'human',
    'agent',
    'staff',
    'call me',
    'real person',
    'talk to someone',
    'speak to someone',
    'customer care',
    'manager',
    'manussayek',
    'manusseyek',
    'kenekuta',
    'call karanna',
    'call ekak',
    'මනුස්සයෙක්',
    'කතා කරන්න',
    'கால் பண்ணுங்க',
    'மனிதர்'
  ]
};

const ASCII = /^[\x20-\x7e]+$/;

function hit(text: string, phrase: string): boolean {
  if (ASCII.test(phrase)) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text);
  }
  return text.includes(phrase);
}

export function matchRule(text: string, rule: HandoffRule): boolean {
  const t = text.toLowerCase();
  return WORDS[rule].some(w => hit(t, w));
}

export const RULE_REASON: Record<HandoffRule, string> = {
  negotiation: 'customer is negotiating the price',
  complaint: 'customer has a complaint',
  staff_request: 'customer asked for a person'
};

/** Intents the model may report that map to the same rules. */
export const INTENT_RULE: Record<string, HandoffRule> = {
  negotiation: 'negotiation',
  price_negotiation: 'negotiation',
  discount: 'negotiation',
  complaint: 'complaint',
  human_request: 'staff_request',
  staff_request: 'staff_request',
  handoff: 'staff_request'
};
