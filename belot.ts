export type Suit = "C" | "D" | "H" | "S";
export const SUITS: Suit[] = ["C", "D", "H", "S"];
export const RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export type Rank = (typeof RANKS)[number];
export type Card = { suit: Suit; rank: Rank };
export type Bid = { kind: "suit"; suit: Suit } | { kind: "NT" } | { kind: "AT" };
export type Play = { player: number; card: Card };

export const SUIT_SYMBOL: Record<Suit, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };
export const isRed = (s: Suit) => s === "H" || s === "D";

const TRUMP_ORDER: Rank[] = ["7", "8", "Q", "K", "10", "A", "9", "J"];
const PLAIN_ORDER: Rank[] = ["7", "8", "9", "J", "Q", "K", "10", "A"];
const TRUMP_PTS: Record<Rank, number> = { J: 20, "9": 14, A: 11, "10": 10, K: 4, Q: 3, "8": 0, "7": 0 };
const PLAIN_PTS: Record<Rank, number> = { A: 11, "10": 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0 };

export const bidRank = (b: Bid) => (b.kind === "suit" ? SUITS.indexOf(b.suit) : b.kind === "NT" ? 4 : 5);
export const bidLabel = (b: Bid) =>
  b.kind === "suit" ? SUIT_SYMBOL[b.suit] : b.kind === "NT" ? "No Trumps" : "All Trumps";
export const ALL_BIDS: Bid[] = [
  ...SUITS.map((suit) => ({ kind: "suit", suit }) as Bid),
  { kind: "NT" },
  { kind: "AT" },
];

export const isTrump = (c: Card, b: Bid) => b.kind === "AT" || (b.kind === "suit" && c.suit === b.suit);
export const order = (c: Card, b: Bid) =>
  isTrump(c, b) ? TRUMP_ORDER.indexOf(c.rank) : PLAIN_ORDER.indexOf(c.rank);
export const points = (c: Card, b: Bid) => (isTrump(c, b) ? TRUMP_PTS[c.rank] : PLAIN_PTS[c.rank]);

export function newDeck(): Card[] {
  const d: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) d.push({ suit, rank });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = d[i]!; d[i] = d[j]!; d[j] = t;
  }
  return d;
}

export function sortHand(h: Card[], b?: Bid): Card[] {
  return [...h].sort((a, c) =>
    a.suit !== c.suit
      ? SUITS.indexOf(a.suit) - SUITS.indexOf(c.suit)
      : b
        ? order(a, b) - order(c, b)
        : RANKS.indexOf(a.rank) - RANKS.indexOf(c.rank),
  );
}

function score(c: Card, led: Suit, b: Bid) {
  if (b.kind === "suit" && isTrump(c, b)) return 200 + order(c, b);
  if (c.suit === led) return 100 + order(c, b);
  return 0;
}

export function trickWinner(trick: Play[], b: Bid): number {
  const led = trick[0]!.card.suit;
  let best = trick[0]!;
  for (const p of trick) if (score(p.card, led, b) > score(best.card, led, b)) best = p;
  return best.player;
}

export function legalMoves(hand: Card[], trick: Play[], b: Bid, player: number): Card[] {
  if (!trick.length) return hand;
  const led = trick[0]!.card.suit;
  const winner = trickWinner(trick, b);
  const best = Math.max(...trick.map((p) => score(p.card, led, b)));
  const same = hand.filter((c) => c.suit === led);
  if (same.length) {
    if (isTrump(trick[0]!.card, b)) {
      const higher = same.filter((c) => score(c, led, b) > best);
      return higher.length ? higher : same;
    }
    return same;
  }
  if (b.kind === "suit") {
    const trumps = hand.filter((c) => isTrump(c, b));
    const partnerWinning = (winner + 2) % 4 === player;
    if (trumps.length && !partnerWinning) {
      const higher = trumps.filter((c) => score(c, led, b) > best);
      if (higher.length) return higher;
      if (!trick.some((p) => isTrump(p.card, b))) return trumps;
    }
  }
  return hand;
}

export function botBid(hand: Card[], current: Bid | null): Bid | null {
  const min = current ? bidRank(current) : -1;
  const has = (s: Suit, r: Rank) => hand.some((c) => c.suit === s && c.rank === r);
  const aces = hand.filter((c) => c.rank === "A").length;
  const options: { bid: Bid; v: number }[] = SUITS.map((s) => {
    const n = hand.filter((c) => c.suit === s).length;
    return {
      bid: { kind: "suit", suit: s } as Bid,
      v: (has(s, "J") ? 3 : 0) + (has(s, "9") ? 2 : 0) + n + (aces - (has(s, "A") ? 1 : 0)),
    };
  });
  options.push({ bid: { kind: "NT" }, v: aces * 2 + hand.filter((c) => c.rank === "10").length });
  options.push({
    bid: { kind: "AT" },
    v: hand.filter((c) => c.rank === "J").length * 3 + hand.filter((c) => c.rank === "9").length * 2 - 1,
  });
  const ok = options.filter((o) => o.v >= 7 && bidRank(o.bid) > min).sort((a, b) => b.v - a.v);
  return ok[0]?.bid ?? null;
}

export function botPlay(hand: Card[], trick: Play[], b: Bid, player: number): Card {
  const legal = legalMoves(hand, trick, b, player);
  const byPts = [...legal].sort((x, y) => points(x, b) - points(y, b) || order(x, b) - order(y, b));
  if (!trick.length) {
    const strong = legal.find((c) => (isTrump(c, b) ? c.rank === "J" : c.rank === "A"));
    return (strong ?? byPts[0])!;
  }
  const winner = trickWinner(trick, b);
  if ((winner + 2) % 4 === player) {
    const nonTrump = byPts.filter((c) => !isTrump(c, b) || b.kind === "AT");
    return (nonTrump.length ? nonTrump : byPts)[nonTrump.length ? nonTrump.length - 1 : 0]!;
  }
  const winning = legal
    .filter((c) => trickWinner([...trick, { player, card: c }], b) === player)
    .sort((x, y) => order(x, b) - order(y, b));
  return (winning[0] ?? byPts[0])!;
}
