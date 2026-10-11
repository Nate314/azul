import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLORS,
  factoryCount,
  wallColor,
  wallColumn,
  canPlaceOnLine,
  legalLines,
  sourceColors,
  scorePlacement,
  floorPenalty,
  completeRows,
  endGameBonus,
  createGameState,
  addPlayer,
  removePlayer,
  nextActivePlayer,
  toPublicState
} from './rules.ts';
import type { GameState, PatternLine, PlayerBoard } from './types.ts';

function wallOf(...cells: [number, number][]): boolean[][] {
  const wall = Array.from({ length: 5 }, () => Array<boolean>(5).fill(false));
  for (const [row, col] of cells) wall[row][col] = true;
  return wall;
}

function linesOf(lines: Record<number, PatternLine> = {}): PatternLine[] {
  return Array.from({ length: 5 }, (_, row) => lines[row] ?? { color: null, count: 0 });
}

function board(overrides: Partial<PlayerBoard> = {}): PlayerBoard {
  return { patternLines: linesOf(), wall: wallOf(), floor: [], score: 0, ...overrides };
}

const fullRow = (row: number): [number, number][] => [0, 1, 2, 3, 4].map(col => [row, col]);
const fullColumn = (col: number): [number, number][] => [0, 1, 2, 3, 4].map(row => [row, col]);

test('factory count depends on player count', () => {
  assert.equal(factoryCount(2), 5);
  assert.equal(factoryCount(3), 7);
  assert.equal(factoryCount(4), 9);
});

test('the wall shifts the colours one step per row', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(col => wallColor(0, col)), ['blue', 'yellow', 'red', 'black', 'cyan']);
  assert.deepEqual([0, 1, 2, 3, 4].map(col => wallColor(1, col)), ['cyan', 'blue', 'yellow', 'red', 'black']);
  assert.equal(wallColor(4, 0), 'yellow');
  for (let col = 0; col < 5; col++) {
    assert.equal(new Set([0, 1, 2, 3, 4].map(row => wallColor(row, col))).size, 5);
  }
});

test('wallColumn finds the space for a colour in a row', () => {
  for (let row = 0; row < 5; row++) {
    for (const color of COLORS) assert.equal(wallColor(row, wallColumn(row, color)), color);
  }
});

test('an empty board takes any colour on any line', () => {
  assert.deepEqual(legalLines(board(), 'red'), [0, 1, 2, 3, 4]);
});

test('a line holds one colour and stops when full', () => {
  const b = board({ patternLines: linesOf({ 0: { color: 'red', count: 1 }, 2: { color: 'blue', count: 1 } }) });
  assert.deepEqual(legalLines(b, 'red'), [1, 3, 4]);
  assert.deepEqual(legalLines(b, 'blue'), [1, 2, 3, 4]);
});

test('a line refuses a colour already on the wall in that row', () => {
  const b = board({ wall: wallOf([1, wallColumn(1, 'red')]) });
  assert.equal(canPlaceOnLine(b, 1, 'red'), false);
  assert.equal(canPlaceOnLine(b, 1, 'blue'), true);
  assert.equal(canPlaceOnLine(b, 2, 'red'), true);
});

test('lines off the board are never legal', () => {
  assert.equal(canPlaceOnLine(board(), 5, 'red'), false);
  assert.equal(canPlaceOnLine(board(), -1, 'red'), false);
});

test('sourceColors lists each colour in a source once', () => {
  const table = { factories: [['red', 'blue', 'red', 'red'] as const].map(tiles => [...tiles]), center: [] };
  assert.deepEqual(sourceColors(table, { type: 'factory', index: 0 }), ['blue', 'red']);
  assert.deepEqual(sourceColors(table, { type: 'factory', index: 7 }), []);
  assert.deepEqual(sourceColors(table, { type: 'center' }), []);
});

test('a tile alone scores 1', () => {
  assert.equal(scorePlacement(wallOf([2, 2]), 2, 2), 1);
  assert.equal(scorePlacement(wallOf([0, 0], [0, 2]), 0, 2), 1); // a gap breaks the run
});

test('a tile scores the length of its row or column run', () => {
  assert.equal(scorePlacement(wallOf([0, 0], [0, 1], [0, 2]), 0, 2), 3);
  assert.equal(scorePlacement(wallOf([0, 0], [1, 0]), 1, 0), 2);
  assert.equal(scorePlacement(wallOf([0, 0], [0, 1], [0, 2]), 0, 1), 3); // joins both sides
});

test('a tile in both a row run and a column run scores both', () => {
  assert.equal(scorePlacement(wallOf([2, 0], [2, 1], [2, 2], [1, 2]), 2, 2), 5);
});

test('floor penalties grow along the floor line', () => {
  assert.equal(floorPenalty([]), 0);
  assert.equal(floorPenalty(['first']), 1);
  assert.equal(floorPenalty(['red', 'red', 'blue']), 4);
  assert.equal(floorPenalty(['red', 'red', 'red', 'red', 'red', 'red', 'red']), 14);
});

test('end-game bonuses: 2 per row, 7 per column, 10 per colour', () => {
  assert.equal(endGameBonus(wallOf()), 0);
  assert.equal(endGameBonus(wallOf(...fullRow(0))), 2);
  assert.equal(endGameBonus(wallOf(...fullColumn(0))), 7);
  assert.equal(endGameBonus(wallOf([0, 0], [1, 1], [2, 2], [3, 3], [4, 4])), 10); // every blue
  assert.equal(endGameBonus(wallOf(...[0, 1, 2, 3, 4].flatMap(fullRow))), 95);
  assert.equal(completeRows(wallOf(...fullRow(0), ...fullRow(3), [1, 1])), 2);
});

function lobby(...names: string[]): GameState {
  let state = createGameState('g');
  for (const name of names) {
    const result = addPlayer(state, name);
    if ('error' in result) assert.fail(result.error);
    state = result.state;
  }
  return state;
}

// Every tile in play, wherever it is; the first-player marker is not a tile
function countTiles(state: GameState): number {
  const onBoards = Object.values(state.boards).reduce((sum, b) =>
    sum +
    b.patternLines.reduce((count, line) => count + line.count, 0) +
    b.wall.flat().filter(Boolean).length +
    b.floor.filter(item => item !== 'first').length, 0);
  return state.bag.length + state.lid.length + state.center.length + state.factories.flat().length + onBoards;
}

test('one player waits at an empty table', () => {
  const state = lobby('Alice');
  assert.deepEqual(state.activePlayers, [1]);
  assert.equal(state.currentPlayer, 1);
  assert.deepEqual(state.factories, []);
  assert.equal(state.centerHasMarker, false);
  assert.equal(state.started, false);
  assert.deepEqual(Object.keys(state.boards), ['1']);
});

test('the table is dealt for the number of players', () => {
  const two = lobby('Alice', 'Bob');
  assert.equal(two.factories.length, 5);
  assert.ok(two.factories.every(factory => factory.length === 4));
  assert.equal(two.bag.length, 80);
  assert.equal(two.centerHasMarker, true);
  assert.equal(two.currentPlayer, 1);
  assert.equal(two.roundStarter, 1);
  assert.equal(two.round, 1);
  assert.equal(two.gameStatus, 'Bob joined (2/4 players)');
  assert.equal(countTiles(two), 100);

  assert.equal(lobby('A', 'B', 'C').factories.length, 7);
  const four = lobby('A', 'B', 'C', 'D');
  assert.equal(four.factories.length, 9);
  assert.equal(four.bag.length, 64);
  for (const color of COLORS) {
    assert.equal([...four.bag, ...four.factories.flat()].filter(tile => tile === color).length, 20);
  }
});

test('a fifth player and a late player are refused', () => {
  assert.deepEqual(addPlayer(lobby('A', 'B', 'C', 'D'), 'E'), { error: 'Game is full' });
  assert.deepEqual(addPlayer({ ...lobby('A', 'B'), started: true }, 'C'), { error: 'Game already in progress' });
});

test('leaving the lobby frees the seat and deals afresh', () => {
  const state = removePlayer(lobby('A', 'B', 'C'), 2);
  assert.deepEqual(state.activePlayers, [1, 3]);
  assert.deepEqual(state.playerNames, { 1: 'A', 3: 'C' });
  assert.deepEqual(Object.keys(state.boards), ['1', '3']);
  assert.equal(state.factories.length, 5);
  assert.equal(countTiles(state), 100);

  const rejoined = addPlayer(state, 'D');
  if ('error' in rejoined) assert.fail(rejoined.error);
  assert.equal(rejoined.seat, 2);

  assert.deepEqual(removePlayer(lobby('A', 'B'), 1).factories, []);
});

test('turn order skips empty seats and wraps', () => {
  assert.equal(nextActivePlayer({ activePlayers: [1, 3, 4] }, 1), 3);
  assert.equal(nextActivePlayer({ activePlayers: [1, 3, 4] }, 4), 1);
  assert.equal(nextActivePlayer({ activePlayers: [2] }, 2), 2);
  assert.equal(nextActivePlayer({ activePlayers: [] }, 1), null);
});

test('the public state has no bag, lid or bookkeeping', () => {
  const view = toPublicState(lobby('A', 'B'));
  assert.equal('bag' in view, false);
  assert.equal('lid' in view, false);
  assert.equal('roundStarter' in view, false);
  assert.equal('markerHolder' in view, false);
  assert.equal(view.factories.length, 5);
});
