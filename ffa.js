// Free-For-All manager (server side). Wraps ONE shared combat simulation (Match) and owns the rules around it:
// rounds, one life per round, last-survivor wins, win counting, scoreboard order and match end.
// It never talks to sockets: it only exposes state + an outbox, so every rule is testable and server-authoritative.
import { Match } from './public/js/sim.js';
import { ROUND_RESULTS_TIME, MIN_PLAYERS } from './public/js/constants.js';

export const PHASE = { STARTING: 'STARTING', ACTIVE: 'ROUND_ACTIVE', RESULTS: 'ROUND_RESULTS', FINISHED: 'MATCH_FINISHED' };

export class FfaMatch {
  // members: [{ pid, nick }] in join order (used as the stable tie-break for the scoreboard).
  constructor(members, winsToWin) {
    this.winsToWin = winsToWin; this.phase = PHASE.STARTING; this.round = 0; this.timer = 0;
    this.roundWinner = null; this.champion = null; this.reason = null; this.msgs = [];
    this.order = members.map((m, i) => ({ pid: m.pid, nick: m.nick, wins: 0, idx: i }));
    this.sim = new Match({ respawn: false, enemies: false, aliveOnly: true });   // players are the only opponents
  }
  standings() { return [...this.order].sort((a, b) => b.wins - a.wins || a.idx - b.idx); }
  push() {
    this.msgs.push({ ev: 'g:phase', data: { ph: this.phase, r: this.round, w: this.winsToWin, rw: this.roundWinner, mw: this.champion,
      why: this.reason, d: ROUND_RESULTS_TIME, sc: this.standings().map(p => [p.pid, p.nick, p.wins]) } });
  }

  start() {                                         // called by the server once clients are ready
    if (this.phase !== PHASE.STARTING || this.order.length < MIN_PLAYERS) return false;
    this.beginRound(); return true;
  }
  beginRound() {
    this.round++; this.roundWinner = null;
    this.sim.startRound(this.order.map(p => ({ id: p.pid, nick: p.nick })));
    this.phase = PHASE.ACTIVE; this.push();
  }
  // Advances time; returns true when the combat simulation actually stepped (=> a snapshot should be sent).
  step(dt) {
    if (this.phase === PHASE.ACTIVE) { this.sim.step(dt); this.checkRoundEnd(); return true; }
    if (this.phase === PHASE.RESULTS && (this.timer -= dt) <= 0) {
      if (this.order.length < MIN_PLAYERS) this.finish(this.standings()[0] ? this.standings()[0].pid : null, 'WO');
      else this.beginRound();
    }
    return false;
  }
  setInput(pid, d) { if (this.phase === PHASE.ACTIVE) this.sim.setInput(pid, d); }   // eliminated planes ignore it (sim)

  checkRoundEnd() {
    if (this.phase !== PHASE.ACTIVE) return;        // idempotent: a round can end (and award a win) only once
    const alive = [...this.sim.players.values()].filter(p => p.alive);
    if (alive.length > 1) return;
    this.phase = PHASE.RESULTS; this.timer = ROUND_RESULTS_TIME;
    const w = alive.length === 1 ? this.order.find(p => p.pid === alive[0].id) : null; // 0 alive: nobody wins
    this.roundWinner = w ? w.pid : null;
    if (w) { w.wins++; if (w.wins >= this.winsToWin) { this.finish(w.pid, 'WINS'); return; } }
    this.push();
  }
  finish(pid, reason) { this.phase = PHASE.FINISHED; this.champion = pid; this.reason = reason; this.push(); }

  // Disconnect/leave policy: the player's wins leave the scoreboard with them; the round is re-evaluated at once.
  removePlayer(pid) {
    const i = this.order.findIndex(p => p.pid === pid);
    if (i < 0) return;
    this.order.splice(i, 1); this.sim.removePlayer(pid);
    if (this.roundWinner === pid) this.roundWinner = null;
    if (this.phase === PHASE.ACTIVE) this.checkRoundEnd();
    else if (this.phase === PHASE.RESULTS || this.phase === PHASE.FINISHED) {
      if (this.phase === PHASE.FINISHED && this.champion === pid) this.champion = this.standings()[0] ? this.standings()[0].pid : null;
      this.push();
    }
  }
  snapshot() { return this.sim.snapshot(); }
  drain() { return { events: this.sim.drainEvents(), msgs: this.msgs.splice(0) }; }
}
