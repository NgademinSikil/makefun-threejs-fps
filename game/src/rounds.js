// Rounds: the match state machine. One place owns the phase, the clock, the
// score, the money and the win conditions, so main.js never has to guess.
// Phases: buy (12 s) -> live (100 s) -> planted (35 s detonation) -> roundEnd
// (4 s) -> next buy ... -> matchEnd. First to 5 rounds wins, max 9 rounds.
export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const DETONATE_SECONDS = 35;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const START_MONEY = 1000;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;
export const WIN_REWARD = 1000;
export const LOSS_REWARD = 600;

export function createRounds(hooks) {
  const state = {
    phase: 'buy', // buy | live | planted | roundEnd | matchEnd
    phaseT: BUY_SECONDS,
    round: 1,
    scoreAttack: 0,
    scoreDefend: 0,
    money: START_MONEY,
    kills: 0,
    deaths: 0,
    plants: 0,
    defuses: 0,
    plantedSite: null,
    roundWinner: null, // 'attack' | 'defend'
    roundReason: '',
    matchWinner: null,
  };

  function startRound() {
    state.phase = 'buy';
    state.phaseT = BUY_SECONDS;
    state.plantedSite = null;
    state.roundWinner = null;
    state.roundReason = '';
    hooks.onRoundStart(state.round);
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.roundWinner = winner;
    state.roundReason = reason;
    if (winner === 'attack') state.scoreAttack += 1;
    else state.scoreDefend += 1;
    state.money += winner === 'attack' ? WIN_REWARD : LOSS_REWARD;
    state.phase = 'roundEnd';
    state.phaseT = 4;
    hooks.onRoundEnd(winner, reason, state);
    if (state.scoreAttack >= WIN_ROUNDS || state.scoreDefend >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.matchWinner = state.scoreAttack > state.scoreDefend ? 'attack' : state.scoreDefend > state.scoreAttack ? 'defend' : 'draw';
    }
  }

  function step(dt) {
    if (state.phase === 'matchEnd') return;
    state.phaseT -= dt;
    if (state.phase === 'buy' && state.phaseT <= 0) {
      state.phase = 'live';
      state.phaseT = ROUND_SECONDS;
      hooks.onLive();
    } else if (state.phase === 'live' && state.phaseT <= 0) {
      endRound('defend', 'Time expired — the spike was never planted');
    } else if (state.phase === 'planted' && state.phaseT <= 0) {
      endRound('attack', 'Spike detonated at Site ' + (state.plantedSite ? state.plantedSite.letter : ''));
    } else if (state.phase === 'roundEnd' && state.phaseT <= 0) {
      if (state.matchWinner) {
        state.phase = 'matchEnd';
        hooks.onMatchEnd(state.matchWinner, state);
      } else {
        state.round += 1;
        startRound();
      }
    }
  }

  function onPlant(site) {
    if (state.phase !== 'live') return;
    state.plantedSite = site;
    state.phase = 'planted';
    state.phaseT = DETONATE_SECONDS;
    state.plants += 1;
    state.money += PLANT_REWARD;
    hooks.onPlant(site, state);
  }

  function onDefuse() {
    if (state.phase !== 'planted') return;
    state.defuses += 1;
    endRound('defend', 'Spike defused at Site ' + (state.plantedSite ? state.plantedSite.letter : ''));
  }

  function onKill(victimTeam) {
    state.kills += 1;
    state.money += KILL_REWARD;
  }

  function onDeath() {
    state.deaths += 1;
  }

  function checkElimination(attackAlive, defendAlive, playerAlive) {
    if (state.phase !== 'live' && state.phase !== 'planted') return;
    if (state.phase === 'planted') {
      if (attackAlive === 0) endRound('defend', 'Attackers eliminated — spike defused');
      return;
    }
    if (defendAlive === 0) endRound('attack', 'Defenders eliminated');
    else if (attackAlive === 0) endRound('defend', 'Attackers eliminated');
  }

  function resetMatch() {
    state.phase = 'buy';
    state.phaseT = BUY_SECONDS;
    state.round = 1;
    state.scoreAttack = 0;
    state.scoreDefend = 0;
    state.money = START_MONEY;
    state.kills = 0;
    state.deaths = 0;
    state.plants = 0;
    state.defuses = 0;
    state.plantedSite = null;
    state.roundWinner = null;
    state.roundReason = '';
    state.matchWinner = null;
  }

  return { state, step, startRound, endRound, onPlant, onDefuse, onKill, onDeath, checkElimination, resetMatch };
}
