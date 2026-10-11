// Azul rules shared by the browser (legal picks and lines) and the server (validation).
import type { Color, FloorItem, PlayerBoard, PublicGameState, Source } from './types.ts';

export const COLORS: Color[] = ['blue', 'yellow', 'red', 'black', 'cyan'];
export const MAX_PLAYERS = 4;
export const LINE_COUNT = 5;
export const TILES_PER_COLOR = 20;
export const FACTORY_SIZE = 4;
export const FLOOR_PENALTIES = [1, 1, 2, 2, 2, 3, 3];

export function factoryCount(playerCount: number): number {
  return playerCount * 2 + 1;
}

// Each row of the wall is the row above shifted one step right
export function wallColor(row: number, col: number): Color {
  return COLORS[(col - row + LINE_COUNT) % LINE_COUNT];
}

export function wallColumn(row: number, color: Color): number {
  return (COLORS.indexOf(color) + row) % LINE_COUNT;
}

export function canPlaceOnLine(board: PlayerBoard, line: number, color: Color): boolean {
  const patternLine = board.patternLines[line];
  if (!patternLine) return false;
  if (patternLine.color !== null && patternLine.color !== color) return false;
  if (patternLine.count >= line + 1) return false;
  return !board.wall[line][wallColumn(line, color)];
}

export function legalLines(board: PlayerBoard, color: Color): number[] {
  return board.patternLines.map((_, line) => line).filter(line => canPlaceOnLine(board, line, color));
}

type Table = Pick<PublicGameState, 'factories' | 'center'>;

export function sourceTiles(table: Table, source: Source): Color[] {
  return source.type === 'center' ? table.center : table.factories[source.index] ?? [];
}

export function sourceColors(table: Table, source: Source): Color[] {
  const tiles = sourceTiles(table, source);
  return COLORS.filter(color => tiles.includes(color));
}

// The unbroken run of wall tiles through (row, col) along one axis, counting the tile itself
function runLength(wall: boolean[][], row: number, col: number, rowStep: number, colStep: number): number {
  let length = 1;
  for (const direction of [-1, 1]) {
    let r = row + rowStep * direction;
    let c = col + colStep * direction;
    while (wall[r]?.[c]) {
      length++;
      r += rowStep * direction;
      c += colStep * direction;
    }
  }
  return length;
}

// Points for the tile just placed at (row, col), which must already be set in `wall`
export function scorePlacement(wall: boolean[][], row: number, col: number): number {
  const horizontal = runLength(wall, row, col, 0, 1);
  const vertical = runLength(wall, row, col, 1, 0);
  if (horizontal === 1 && vertical === 1) return 1;
  return (horizontal > 1 ? horizontal : 0) + (vertical > 1 ? vertical : 0);
}

export function floorPenalty(floor: FloorItem[]): number {
  return FLOOR_PENALTIES.slice(0, floor.length).reduce((sum, penalty) => sum + penalty, 0);
}

export function completeRows(wall: boolean[][]): number {
  return wall.filter(row => row.every(Boolean)).length;
}

export function endGameBonus(wall: boolean[][]): number {
  const lines = wall.map((_, index) => index);
  const columns = lines.filter(col => wall.every(row => row[col])).length;
  const colors = COLORS.filter(color => lines.every(row => wall[row][wallColumn(row, color)])).length;
  return completeRows(wall) * 2 + columns * 7 + colors * 10;
}
