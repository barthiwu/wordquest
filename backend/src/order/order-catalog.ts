/**
 * The Order (Final Core Progression Spec §5.3) — four fixed identity
 * groups. This catalog is static content, not a database table: "the
 * Order data model must support future Orders without changing the
 * player progression model" (§5.5) means the CATALOG can grow, but a
 * player's selection history (OrderSelection) never needs to change
 * shape to support that — it just stores whichever OrderName was
 * picked at the time.
 */
export interface OrderCatalogEntry {
  key: 'SCRIBES' | 'SEEKERS' | 'ORATORS' | 'ARTISANS';
  name: string;
  symbol: string;
  motto: string;
  philosophy: string;
  /** Asset key for the Order's banner art — resolved client-side, same convention as QuestCard.artwork. */
  banner: string;
  /** The Order's identity color, as a hex code — drives the Passport/Order-selection screens' accent color. */
  colour: string;
}

export const ORDER_CATALOG: OrderCatalogEntry[] = [
  {
    key: 'SCRIBES',
    name: 'The Scribes',
    symbol: 'Book / quill',
    motto: 'Knowledge becomes legacy.',
    philosophy: 'Reading, reflection, and expression.',
    banner: 'order_banner_scribes',
    colour: '#2E4B6E',
  },
  {
    key: 'SEEKERS',
    name: 'The Seekers',
    symbol: 'Compass / star',
    motto: 'There is always more to discover.',
    philosophy: 'Curiosity and intellectual discovery.',
    banner: 'order_banner_seekers',
    colour: '#1F7A5C',
  },
  {
    key: 'ORATORS',
    name: 'The Orators',
    symbol: 'Speech mark / flame',
    motto: 'Words are meant to be heard.',
    philosophy: 'Speaking, confidence, and communication.',
    banner: 'order_banner_orators',
    colour: '#B23A2E',
  },
  {
    key: 'ARTISANS',
    name: 'The Artisans',
    symbol: 'Pen / crafted glyph',
    motto: 'Mastery is built.',
    philosophy: 'Practice, precision, discipline, and refinement.',
    banner: 'order_banner_artisans',
    colour: '#7A5C1F',
  },
];

export const ORDER_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
