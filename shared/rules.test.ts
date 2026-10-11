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
  endGameBonus
} from './rules.ts';
import type { PatternLine, PlayerBoard } from './types.ts';

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
