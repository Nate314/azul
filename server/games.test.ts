import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameManager } from './games.ts';
import type { Move, PublicGameState, Result } from '../shared/types.ts';

type Manager = ReturnType<typeof createGameManager>;

function gameWith(...names: string[]): Manager {
  const manager = createGameManager();
  for (const name of names) manager.join('g1', name);
  return manager;
}

function ok(result: Result<PublicGameState>): PublicGameState {
  if ('error' in result) assert.fail(result.error);
  return result.state;
}

function joined(result: ReturnType<Manager['join']>) {
  if ('error' in result) assert.fail(result.error);
  return result;
}

function left(result: ReturnType<Manager['leave']>): PublicGameState {
  assert.ok(result, 'expected the game to still exist');
  return result.state;
}

function current(manager: Manager): PublicGameState {
  const state = manager.getState('g1');
  assert.ok(state, 'expected the game to exist');
  return state;
}

// A move that is always legal: one colour from the first pile with tiles, to the floor
function anyMove(state: PublicGameState): Move {
  const index = state.factories.findIndex(tiles => tiles.length > 0);
  if (index < 0) return { source: { type: 'center' }, color: state.center[0], line: 'floor' };
  return { source: { type: 'factory', index }, color: state.factories[index][0], line: 'floor' };
}

test('join trims the game ID and name and rejects blanks', () => {
  const manager = createGameManager();
  const first = joined(manager.join('  g1 ', ' Alice '));
  assert.equal(first.gameId, 'g1');
  assert.equal(first.seat, 1);
  assert.equal(first.state.playerNames[1], 'Alice');
  assert.equal(joined(manager.join('g1', 'Bob')).seat, 2);
  assert.deepEqual(manager.join('   ', 'X'), { error: 'Please enter a game ID' });
  assert.deepEqual(manager.join('g1', '   '), { error: 'Please enter your name' });
  assert.deepEqual(manager.join(null, undefined), { error: 'Please enter a game ID' });
});

test('names and game IDs are cut to 20 characters', () => {
  const result = joined(createGameManager().join('x'.repeat(30), 'y'.repeat(30)));
  assert.equal(result.gameId.length, 20);
  assert.equal(result.state.playerNames[1].length, 20);
});

test('join is refused at four players and after the first move', () => {
  assert.deepEqual(gameWith('A', 'B', 'C', 'D').join('g1', 'E'), { error: 'Game is full' });

  const manager = gameWith('A', 'B');
  ok(manager.move('g1', 1, anyMove(current(manager))));
  assert.deepEqual(manager.join('g1', 'C'), { error: 'Game already in progress' });
});

test('what browsers receive never includes the bag or the lid', () => {
  const manager = createGameManager();
  const first = joined(manager.join('g1', 'A'));
  const second = joined(manager.join('g1', 'B'));
  const afterMove = ok(manager.move('g1', 1, anyMove(second.state)));
  const afterLeave = left(gameWith('A', 'B', 'C').leave('g1', 3));
  for (const state of [first.state, second.state, afterMove, afterLeave, current(manager)]) {
    assert.equal('bag' in state, false);
    assert.equal('lid' in state, false);
  }
  assert.equal(second.state.factories.length, 5);
});

test('moves are validated', () => {
  const manager = gameWith('A', 'B');
  const move = anyMove(current(manager));
  assert.deepEqual(manager.move('nope', 1, move), { error: 'Game not found' });
  assert.deepEqual(manager.move('g1', 3, move), { error: 'You are not in this game' });
  assert.deepEqual(manager.move('g1', 2, move), { error: 'Not your turn' });
  assert.deepEqual(manager.move('g1', 1, { nonsense: true }), { error: 'Invalid move' });
  assert.deepEqual(manager.move('g1', 1, null), { error: 'Invalid move' });

  const state = ok(manager.move('g1', 1, move));
  assert.equal(state.currentPlayer, 2);
  assert.equal(state.started, true);
  assert.deepEqual(state.factories[0], []);
  assert.deepEqual(current(manager), state);
});

test('leaving the lobby frees the seat and the last one out deletes the game', () => {
  const manager = gameWith('A', 'B');
  assert.deepEqual(left(manager.leave('g1', 1)).activePlayers, [2]);
  assert.equal(joined(manager.join('g1', 'C')).seat, 1);
  manager.leave('g1', 1);
  assert.equal(manager.leave('g1', 2), null);
  assert.equal(manager.getState('g1'), undefined);
  assert.equal(manager.leave('g1', 2), null);
});

test('leaving mid-game hands the win to the last player', () => {
  const manager = gameWith('A', 'B');
  ok(manager.move('g1', 1, anyMove(current(manager))));
  const state = left(manager.leave('g1', 2));
  assert.equal(state.isGameOver, true);
  assert.deepEqual(state.winners, [1]);
  assert.deepEqual(manager.move('g1', 1, anyMove(state)), { error: 'The game is over' });
});

// Plays legal moves, in turn, until the round has been scored
function playRound(manager: Manager): PublicGameState {
  let state = current(manager);
  while (!state.roundSummary) {
    if (state.currentPlayer === null) assert.fail('nobody to move');
    state = ok(manager.move('g1', state.currentPlayer, anyMove(state)));
  }
  return state;
}

test('the next round waits for every player to acknowledge the summary', () => {
  const manager = gameWith('A', 'B');
  assert.deepEqual(manager.acknowledge('g1', 1), { error: 'Nothing to continue' });

  const scored = playRound(manager);
  assert.equal(scored.round, 1);
  assert.equal(scored.currentPlayer, null);
  assert.deepEqual(Object.keys(scored.roundSummary?.seats ?? {}), ['1', '2']);
  assert.deepEqual(manager.acknowledge('g1', 3), { error: 'You are not in this game' });

  const waiting = ok(manager.acknowledge('g1', 1));
  assert.deepEqual(waiting.roundSummary?.acknowledged, [1]);
  assert.equal(waiting.round, 1);

  const next = ok(manager.acknowledge('g1', 2));
  assert.equal(next.roundSummary, null);
  assert.equal(next.round, 2);
  assert.equal(next.factories.flat().length, 20);
  assert.equal('bag' in next, false);
});

test('an undo approved by everyone restores the previous turn', () => {
  const manager = gameWith('A', 'B');
  assert.equal(current(manager).undoAvailable, false);
  assert.deepEqual(manager.requestUndo('g1', 1), { error: 'Nothing to undo' });

  const before = current(manager);
  assert.equal(ok(manager.move('g1', 1, anyMove(before))).undoAvailable, true);

  const voting = ok(manager.requestUndo('g1', 2));
  assert.deepEqual(voting.undoVote, { requestedBy: 2, votes: { 2: true } });
  assert.equal(voting.gameStatus, 'B wants to undo the last turn');
  assert.deepEqual(manager.requestUndo('g1', 1), { error: 'An undo vote is already in progress' });
  assert.deepEqual(manager.move('g1', 2, anyMove(voting)), { error: 'An undo vote is in progress' });
  assert.deepEqual(manager.voteUndo('g1', 2, true), { error: 'You already voted' });

  const restored = ok(manager.voteUndo('g1', 1, true));
  assert.equal(restored.undoVote, null);
  assert.equal(restored.undoAvailable, false);
  assert.equal(restored.currentPlayer, 1);
  assert.equal(restored.started, true); // joining stays closed
  assert.equal(restored.gameStatus, 'Last turn undone');
  assert.deepEqual(restored.factories, before.factories);
  assert.deepEqual(restored.boards, before.boards);
  assert.deepEqual(manager.voteUndo('g1', 1, true), { error: 'No undo vote in progress' });
  assert.deepEqual(manager.requestUndo('g1', 1), { error: 'Nothing to undo' });
});

test('one decline cancels the undo', () => {
  const manager = gameWith('A', 'B', 'C');
  const moved = ok(manager.move('g1', 1, anyMove(current(manager))));
  ok(manager.requestUndo('g1', 1));
  ok(manager.voteUndo('g1', 2, true));
  const declined = ok(manager.voteUndo('g1', 3, 'yes')); // anything but true is a decline
  assert.equal(declined.undoVote, null);
  assert.equal(declined.gameStatus, 'C declined the undo');
  assert.deepEqual(declined.boards, moved.boards);
  assert.equal(declined.currentPlayer, 2);
  assert.equal(declined.undoAvailable, true);
});

test('a player leaving during a vote no longer counts', () => {
  const manager = gameWith('A', 'B', 'C');
  const before = current(manager);
  ok(manager.move('g1', 1, anyMove(before)));
  ok(manager.requestUndo('g1', 1));
  ok(manager.voteUndo('g1', 2, true));
  const state = left(manager.leave('g1', 3));
  assert.equal(state.undoVote, null);
  assert.equal(state.gameStatus, 'Last turn undone');
  assert.deepEqual(state.factories, before.factories);
  assert.equal(state.currentPlayer, 1);
});

test('undoing the move that ended a round brings the round back', () => {
  const manager = gameWith('A', 'B');
  const scored = playRound(manager);
  assert.ok(scored.roundSummary);
  ok(manager.requestUndo('g1', 1));
  const restored = ok(manager.voteUndo('g1', 2, true));
  assert.equal(restored.roundSummary, null);
  assert.equal(restored.round, 1);
  assert.notEqual(restored.currentPlayer, null);
  assert.ok(restored.center.length + restored.factories.flat().length > 0);

  // And after the next round has been dealt
  playRound(manager);
  ok(manager.acknowledge('g1', 1));
  assert.equal(ok(manager.acknowledge('g1', 2)).round, 2);
  ok(manager.requestUndo('g1', 2));
  const back = ok(manager.voteUndo('g1', 1, true));
  assert.equal(back.round, 1);
  assert.equal(back.roundSummary, null);
  assert.equal(playRound(manager).round, 1);
});
