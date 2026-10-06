import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ALL_BIDS,
  type Bid,
  type Card,
  type Play,
  SUIT_SYMBOL,
  bidLabel,
  bidRank,
  botBid,
  botPlay,
  isRed,
  legalMoves,
  newDeck,
  points,
  sortHand,
  trickWinner,
} from "@/lib/belot";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Belot — Play the card game online" },
      { name: "description", content: "Play Bulgarian Belot against three smart bots, right in your browser." },
      { property: "og:title", content: "Belot — Play the card game online" },
      { property: "og:description", content: "Play Bulgarian Belot against three smart bots." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Game,
});

const NAMES = ["You", "Ivan (bot)", "Partner (bot)", "Maria (bot)"];
const WIN = 151;

type Phase = "bidding" | "playing" | "collect" | "roundEnd" | "gameOver";
type State = {
  phase: Phase;
  dealer: number;
  hands: Card[][];
  rest: Card[];
  turn: number;
  log: { player: number; bid: Bid | null }[];
  contract: { bid: Bid; team: number } | null;
  passes: number;
  trick: Play[];
  won: Card[][];
  lastTeam: number;
  scores: [number, number];
  result: string;
};

function newRound(dealer: number, scores: [number, number]): State {
  const d = newDeck();
  const hands = [0, 1, 2, 3].map((i) => sortHand(d.slice(i * 5, i * 5 + 5)));
  return {
    phase: "bidding", dealer, hands, rest: d.slice(20), turn: (dealer + 1) % 4, log: [],
    contract: null, passes: 0, trick: [], won: [[], []], lastTeam: 0, scores, result: "",
  };
}

function applyBid(s: State, player: number, bid: Bid | null): State {
  const log = [...s.log, { player, bid }];
  const contract = bid ? { bid, team: player % 2 } : s.contract;
  const passes = bid ? 0 : s.passes + 1;
  if (!contract && passes >= 4) return newRound((s.dealer + 1) % 4, s.scores);
  if (contract && passes >= 3) {
    const hands = s.hands.map((h, i) => sortHand([...h, ...s.rest.slice(i * 3, i * 3 + 3)], contract.bid));
    return { ...s, log, contract, passes, hands, rest: [], phase: "playing", turn: (s.dealer + 1) % 4 };
  }
  return { ...s, log, contract, passes, turn: (player + 1) % 4 };
}

function applyPlay(s: State, player: number, card: Card): State {
  const hands = s.hands.map((h, i) => (i === player ? h.filter((c) => c !== card) : h));
  const trick = [...s.trick, { player, card }];
  if (trick.length < 4) return { ...s, hands, trick, turn: (player + 1) % 4 };
  return { ...s, hands, trick, phase: "collect", turn: trickWinner(trick, s.contract!.bid) };
}

function collect(s: State): State {
  const team = s.turn % 2;
  const won = s.won.map((w, i) => (i === team ? [...w, ...s.trick.map((p) => p.card)] : w));
  const next = { ...s, won, trick: [], lastTeam: team, phase: "playing" as Phase };
  if (s.hands[0]!.length) return next;
  const { bid, team: ct } = s.contract!;
  const p0 = won[0]!.reduce((a, c) => a + points(c, bid), 0); const p1 = won[1]!.reduce((a, c) => a + points(c, bid), 0); const pts = [p0, p1] as [number, number];
  pts[team]! += 10;
  if (bid.kind === "NT") { pts[0]! *= 2; pts[1]! *= 2; }
  let result = "";
  if (pts[ct]! < pts[1 - ct]!) {
    pts[1 - ct]! += pts[ct]!; pts[ct]! = 0;
    result = `${ct === 0 ? "Your team" : "Opponents"} went inside!`;
  }
  const gp = pts.map((p) => Math.round(p / 10));
  const scores: [number, number] = [s.scores[0] + gp[0]!, s.scores[1] + gp[1]!];
  result = `${result} Card points ${pts[0]!} – ${pts[1]!} → +${gp[0]!} / +${gp[1]!}`.trim();
  const over = (scores[0] >= WIN || scores[1] >= WIN) && scores[0] !== scores[1];
  return { ...next, scores, result, phase: over ? "gameOver" : "roundEnd" };
}

function CardView({ card, onClick, disabled, small }: { card: Card; onClick?: (() => void) | undefined; disabled?: boolean; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`playing-card ${small ? "h-24 w-16" : "h-32 w-22"} ${isRed(card.suit) ? "text-suit-red" : "text-suit-black"} ${onClick && !disabled ? "playable" : ""} ${disabled ? "opacity-50" : ""}`}
    >
      <span className="absolute left-1.5 top-1 text-sm font-bold leading-none">{card.rank}<br />{SUIT_SYMBOL[card.suit]}</span>
      <span className="text-3xl">{SUIT_SYMBOL[card.suit]}</span>
    </button>
  );
}

function Backs({ n, vertical }: { n: number; vertical?: boolean }) {
  return (
    <div className={`flex ${vertical ? "flex-col -space-y-12" : "-space-x-10"}`}>
      {Array.from({ length: n }).map((_, i) => <div key={i} className={`card-back ${vertical ? "h-16 w-24" : "h-24 w-16"}`} />)}
    </div>
  );
}

function Game() {
  const [s, setS] = useState<State | null>(null);
  useEffect(() => setS(newRound(3, [0, 0])), []);

  useEffect(() => {
    if (!s) return undefined;
    if (s.phase === "collect") {
      const t = setTimeout(() => setS(collect(s)), 1100);
      return () => clearTimeout(t);
    }
    if (s.turn === 0) return undefined;
    if (s.phase === "bidding") {
      const t = setTimeout(() => setS(applyBid(s, s.turn, botBid(s.hands[s.turn]!, s.contract?.bid ?? null))), 700);
      return () => clearTimeout(t);
    }
    if (s.phase === "playing") {
      const t = setTimeout(() => setS(applyPlay(s, s.turn, botPlay(s.hands[s.turn]!, s.trick, s.contract!.bid, s.turn))), 650);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [s]);

  if (!s) return <div className="min-h-screen bg-felt" />;
  const bid = s.contract?.bid;
  const legal = s.phase === "playing" && s.turn === 0 && bid ? legalMoves(s.hands[0]!, s.trick, bid, 0) : [];
  const trickPos = ["bottom-2 left-1/2 -translate-x-1/2", "right-2 top-1/2 -translate-y-1/2", "top-2 left-1/2 -translate-x-1/2", "left-2 top-1/2 -translate-y-1/2"];
  const label = (p: number) => (
    <div className={`seat-label ${s.turn === p && (s.phase === "bidding" || s.phase === "playing") ? "seat-active" : ""}`}>
      {NAMES[p]}{s.dealer === p ? " · dealer" : ""}
    </div>
  );

  return (
    <div className="min-h-screen bg-felt text-felt-foreground">
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <h1 className="font-display text-3xl text-gold">Belot</h1>
        <div className="flex items-center gap-6 text-sm">
          <span>Contract: <b className="text-gold">{bid ? `${bidLabel(bid)} (${s.contract!.team === 0 ? "Us" : "Them"})` : "—"}</b></span>
          <span className="score-pill">Us {s.scores[0]} : {s.scores[1]} Them</span>
          <span className="opacity-70">to {WIN}</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] items-center gap-4 px-4 pb-6">
        <div className="col-start-2 flex flex-col items-center gap-2">{label(2)}<Backs n={s.hands[2]!.length} /></div>
        <div className="row-start-2 flex flex-col items-center gap-2">{label(3)}<Backs n={s.hands[3]!.length} vertical /></div>

        <div className="table-center relative row-start-2 col-start-2 h-80">
          {s.trick.map((p) => (
            <div key={p.player} className={`absolute ${trickPos[p.player]!}`}><CardView card={p.card} small /></div>
          ))}
          {s.phase === "bidding" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
              <div className="flex flex-wrap justify-center gap-2 text-sm">
                {s.log.map((l, i) => <span key={i} className="bid-chip">{NAMES[l.player]!.split(" ")[0]}: {l.bid ? bidLabel(l.bid) : "Pass"}</span>)}
              </div>
              {s.turn === 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  {ALL_BIDS.filter((b) => bidRank(b) > (bid ? bidRank(bid) : -1)).map((b) => (
                    <button key={bidLabel(b)} className="btn-gold" onClick={() => setS(applyBid(s, 0, b))}>
                      <span className={b.kind === "suit" && isRed(b.suit) ? "text-suit-red" : ""}>{bidLabel(b)}</span>
                    </button>
                  ))}
                  <button className="btn-ghost" onClick={() => setS(applyBid(s, 0, null))}>Pass</button>
                </div>
              )}
            </div>
          )}
          {(s.phase === "roundEnd" || s.phase === "gameOver") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              {s.phase === "gameOver" && <h2 className="font-display text-4xl text-gold">{s.scores[0] > s.scores[1] ? "You win!" : "Bots win"}</h2>}
              <p>{s.result}</p>
              <button className="btn-gold" onClick={() => setS(s.phase === "gameOver" ? newRound(3, [0, 0]) : newRound((s.dealer + 1) % 4, s.scores))}>
                {s.phase === "gameOver" ? "New game" : "Next round"}
              </button>
            </div>
          )}
        </div>

        <div className="row-start-2 col-start-3 flex flex-col items-center gap-2">{label(1)}<Backs n={s.hands[1]!.length} vertical /></div>

        <div className="col-start-2 row-start-3 flex flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-2">
            {s.hands[0]!.map((c) => (
              <CardView key={c.suit + c.rank} card={c}
                onClick={s.phase === "playing" && s.turn === 0 ? () => setS(applyPlay(s, 0, c)) : undefined}
                disabled={s.phase === "playing" && s.turn === 0 && !legal.includes(c)} />
            ))}
          </div>
          {label(0)}
        </div>
      </main>
    </div>
  );
}
