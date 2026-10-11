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

// A move that is always legal: the first tile of the first factory, to the floor
function anyMove(state: PublicGameState): Move {
  return { source: { type: 'factory', index: 0 }, color: state.factories[0][0], line: 'floor' };
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
