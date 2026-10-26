// The life counter's rules, with no React: players, seats, commander damage,
// the turn clock and who's out. Everything here is pure so it can be tested
// and saved as plain JSON.

export type CounterKey = "poison" | "energy" | "experience" | "tax";

export interface LifePlayer {
  id: string;
  name: string;
  /** Index into PLAYER_COLORS. */
  color: number;
  life: number;
  poison: number;
  energy: number;
  experience: number;
  /** Commander tax: extra {2} per previous cast. Stored as casts. */
  tax: number;
  /** Has two commanders (partners), so others track damage from each. */
  partner: boolean;
  /** Commander damage taken, keyed by source: "p2" or "p2#2" for a partner. */
  cmd: Record<string, number>;
  /** Clock time left, or null when the game has no clock. */
  timeLeftMs: number | null;
  timedOut: boolean;
  conceded: boolean;
}

export interface LifeGame {
  id: string;
  startedAt: number;
  startingLife: number;
  /** Players in turn order, which is clockwise around the table. */
  players: LifePlayer[];
  /** Index of the player whose turn it is; -1 before someone is picked to go first. */
  active: number;
  turn: number;
  /** Per-player clock in ms, or null. */
  clockMs: number | null;
  /** When the active player's clock started running, or null when paused. */
  runningSince: number | null;
}

export const POISON_LIMIT = 10;
export const CMD_LIMIT = 21;

export type OutReason = "life" | "poison" | "commander" | "time" | "conceded";

export function outReason(p: LifePlayer): OutReason | null {
  if (p.conceded) return "conceded";
  if (p.timedOut) return "time";
  if (p.poison >= POISON_LIMIT) return "poison";
  if (Object.values(p.cmd).some((n) => n >= CMD_LIMIT)) return "commander";
  if (p.life <= 0) return "life";
  return null;
}

export const isOut = (p: LifePlayer) => outReason(p) !== null;

export function alivePlayers(players: LifePlayer[]): LifePlayer[] {
  return players.filter((p) => !isOut(p));
}

/** The winner once exactly one player is left standing. */
export function winnerOf(game: LifeGame): LifePlayer | null {
  if (game.players.length < 2) return null;
  const alive = alivePlayers(game.players);
  return alive.length === 1 ? alive[0] : null;
}

export interface NewPlayer {
  name: string;
  color: number;
}

export function newGame(opts: { players: NewPlayer[]; startingLife: number; clockMinutes: number | null; now: number; id?: string }): LifeGame {
  const clockMs = opts.clockMinutes ? opts.clockMinutes * 60_000 : null;
  return {
    id: opts.id ?? `g${opts.now}`,
    startedAt: opts.now,
    startingLife: opts.startingLife,
    players: opts.players.map((p, i) => ({
      id: `p${i}`,
      name: p.name,
      color: p.color,
      life: opts.startingLife,
      poison: 0,
      energy: 0,
      experience: 0,
      tax: 0,
      partner: false,
      cmd: {},
      timeLeftMs: clockMs,
      timedOut: false,
      conceded: false,
    })),
    active: -1,
    turn: 0,
    clockMs,
    runningSince: null,
  };
}

/** Same seats, names and colors; everything else back to the start. */
export function rematch(game: LifeGame, now: number): LifeGame {
  const fresh = newGame({
    players: game.players.map((p) => ({ name: p.name, color: p.color })),
    startingLife: game.startingLife,
    clockMinutes: game.clockMs ? game.clockMs / 60_000 : null,
    now,
  });
  return { ...fresh, players: fresh.players.map((p, i) => ({ ...p, partner: game.players[i].partner })) };
}

function update(game: LifeGame, id: string, fn: (p: LifePlayer) => LifePlayer): LifeGame {
  return { ...game, players: game.players.map((p) => (p.id === id ? fn(p) : p)) };
}

export function adjustLife(game: LifeGame, id: string, delta: number): LifeGame {
  return update(game, id, (p) => ({ ...p, life: p.life + delta }));
}

export function adjustCounter(game: LifeGame, id: string, key: CounterKey, delta: number): LifeGame {
  return update(game, id, (p) => ({ ...p, [key]: Math.max(0, p[key] + delta) }));
}

/** Commander damage is also life loss, so life moves with it. */
export function adjustCommanderDamage(game: LifeGame, targetId: string, source: string, delta: number): LifeGame {
  return update(game, targetId, (p) => {
    const before = p.cmd[source] ?? 0;
    const after = Math.max(0, before + delta);
    const cmd = { ...p.cmd, [source]: after };
    if (after === 0) delete cmd[source];
    return { ...p, cmd, life: p.life - (after - before) };
  });
}

export function setPartner(game: LifeGame, id: string, partner: boolean): LifeGame {
  let next = update(game, id, (p) => ({ ...p, partner }));
  if (!partner) {
    // Damage from the second commander folds into the first.
    next = {
      ...next,
      players: next.players.map((p) => {
        const second = p.cmd[`${id}#2`];
        if (second == null) return p;
        const cmd = { ...p.cmd, [id]: (p.cmd[id] ?? 0) + second };
        delete cmd[`${id}#2`];
        return { ...p, cmd };
      }),
    };
  }
  return next;
}

export function setConceded(game: LifeGame, id: string, conceded: boolean): LifeGame {
  return update(game, id, (p) => ({ ...p, conceded }));
}

/** Commander damage sources this player can take damage from. */
export function damageSources(game: LifeGame, targetId: string): Array<{ key: string; player: LifePlayer; second: boolean }> {
  return game.players
    .filter((p) => p.id !== targetId)
    .flatMap((p) => [{ key: p.id, player: p, second: false }, ...(p.partner ? [{ key: `${p.id}#2`, player: p, second: true }] : [])]);
}

export function highestCommanderDamage(p: LifePlayer): number {
  return Math.max(0, ...Object.values(p.cmd));
}

// ── Turns and the clock ───────────────────────────────────────────────────────

export function timeLeft(game: LifeGame, index: number, now: number): number | null {
  const p = game.players[index];
  if (!p || p.timeLeftMs == null) return null;
  const running = index === game.active && game.runningSince != null ? now - game.runningSince : 0;
  return Math.max(0, p.timeLeftMs - running);
}

/** Moves time spent on the running clock into the active player's total. */
function settleClock(game: LifeGame, now: number): LifeGame {
  if (game.runningSince == null || game.active < 0) return game;
  const spent = now - game.runningSince;
  return {
    ...game,
    runningSince: null,
    players: game.players.map((p, i) => (i === game.active && p.timeLeftMs != null ? { ...p, timeLeftMs: Math.max(0, p.timeLeftMs - spent) } : p)),
  };
}

export function nextAlive(players: LifePlayer[], from: number): number {
  for (let step = 1; step <= players.length; step++) {
    const i = (from + step) % players.length;
    if (!isOut(players[i])) return i;
  }
  return -1;
}

/** Picks who goes first; starts their clock. */
export function startTurns(game: LifeGame, first: number, now: number): LifeGame {
  return { ...settleClock(game, now), active: first, turn: 1, runningSince: game.clockMs != null ? now : null };
}

export function passTurn(game: LifeGame, now: number): LifeGame {
  if (game.active < 0) return game;
  const settled = settleClock(game, now);
  const next = nextAlive(settled.players, settled.active);
  if (next < 0) return settled;
  return { ...settled, active: next, turn: settled.turn + 1, runningSince: settled.clockMs != null ? now : null };
}

export function pauseClock(game: LifeGame, now: number): LifeGame {
  return settleClock(game, now);
}

export function resumeClock(game: LifeGame, now: number): LifeGame {
  if (game.clockMs == null || game.active < 0 || game.runningSince != null) return game;
  return { ...game, runningSince: now };
}

/** Called on a timer: a player whose clock runs out is out, and the turn moves on. */
export function checkClock(game: LifeGame, now: number): LifeGame {
  if (game.runningSince == null || game.active < 0) return game;
  if ((timeLeft(game, game.active, now) ?? 1) > 0) return game;
  const settled = settleClock(game, now);
  const out = { ...settled, players: settled.players.map((p, i) => (i === settled.active ? { ...p, timedOut: true, timeLeftMs: 0 } : p)) };
  if (alivePlayers(out.players).length < 2) return out;
  return passTurn({ ...out, runningSince: now }, now);
}

/** Keeps the turn on a live player after someone at the table is knocked out or comes back. */
export function fixActive(game: LifeGame, now: number): LifeGame {
  if (game.active < 0 || !isOut(game.players[game.active])) return game;
  if (alivePlayers(game.players).length < 2) return settleClock(game, now);
  return passTurn(game, now);
}

// ── Seats ─────────────────────────────────────────────────────────────────────

/**
 * Where each seat sits on the phone, lying flat in the middle of the table.
 * Seats are listed in turn order, clockwise from the bottom of the screen:
 * bottom, up the left side, across the top, down the right side.
 */
export interface SeatLayout {
  top: number | null;
  bottom: number | null;
  /** Seat indexes in the left column, listed top to bottom on screen. */
  left: number[];
  right: number[];
}

export function seatLayout(count: number): SeatLayout {
  switch (count) {
    case 2:
      return { bottom: 0, top: 1, left: [], right: [] };
    case 3:
      return { bottom: 0, top: null, left: [1], right: [2] };
    case 4:
      return { bottom: null, top: null, left: [1, 0], right: [2, 3] };
    case 5:
      return { bottom: 0, top: null, left: [2, 1], right: [3, 4] };
    default:
      return { bottom: null, top: null, left: [2, 1, 0], right: [3, 4, 5] };
  }
}

/** Degrees a seat's panel turns so its text faces that player. */
export function seatRotation(layout: SeatLayout, index: number): 0 | 90 | 180 | -90 {
  if (layout.top === index) return 180;
  if (layout.left.includes(index)) return 90;
  if (layout.right.includes(index)) return -90;
  return 0;
}
