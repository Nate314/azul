// Azul rules shared by the browser (legal picks and lines) and the server (validation).
import { asRecord } from './messages.ts';
import type { Color, FloorItem, GameState, Move, PlayerBoard, PublicGameState, Result, Seat, Source } from './types.ts';

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

type Random = () => number;

function shuffle<T>(items: T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function emptyBoard(): PlayerBoard {
  return {
    patternLines: Array.from({ length: LINE_COUNT }, () => ({ color: null, count: 0 })),
    wall: Array.from({ length: LINE_COUNT }, () => Array<boolean>(LINE_COUNT).fill(false)),
    floor: [],
    score: 0
  };
}

type Deal = { factories: Color[][]; bag: Color[]; lid: Color[] };

// Fills `count` factories from the end of the bag. When the bag runs out, the lid is shuffled
// into it. When both run out, the remaining factories stay short or empty.
function deal(bag: Color[], lid: Color[], count: number, random: Random): Deal {
  let supply = bag;
  let discard = lid;
  const factories: Color[][] = [];
  for (let index = 0; index < count; index++) {
    const factory: Color[] = [];
    while (factory.length < FACTORY_SIZE) {
      if (supply.length === 0) {
        if (discard.length === 0) break;
        supply = shuffle(discard, random);
        discard = [];
      }
      factory.push(supply[supply.length - 1]);
      supply = supply.slice(0, -1);
    }
    factories.push(factory);
  }
  return { factories, bag: supply, lid: discard };
}

export function createGameState(gameId: string): GameState {
  return {
    gameId,
    started: false,
    round: 1,
    currentPlayer: null,
    activePlayers: [],
    playerNames: {},
    factories: [],
    center: [],
    centerHasMarker: false,
    boards: {},
    lastMove: null,
    gameStatus: '',
    isGameOver: false,
    winners: [],
    bag: [],
    lid: [],
    roundStarter: null,
    markerHolder: null
  };
}

function without<T>(record: Record<Seat, T>, key: Seat): Record<Seat, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

// Before the first move, the table is dealt afresh for the current player count and the lowest
// seat goes first. Nothing is dealt until two players are seated.
function withLobbyDefaults(state: GameState, random: Random): GameState {
  const count = state.activePlayers.length;
  const starter = state.activePlayers[0] ?? null;
  const fullBag = COLORS.flatMap(color => Array<Color>(TILES_PER_COLOR).fill(color));
  const dealt: Deal = count >= 2
    ? deal(shuffle(fullBag, random), [], factoryCount(count), random)
    : { factories: [], bag: [], lid: [] };
  return {
    ...state,
    ...dealt,
    center: [],
    centerHasMarker: count >= 2,
    boards: Object.fromEntries(state.activePlayers.map(seat => [seat, emptyBoard()])),
    round: 1,
    currentPlayer: starter,
    roundStarter: starter,
    markerHolder: null
  };
}

export function nextActivePlayer(state: Pick<GameState, 'activePlayers'>, fromSeat: Seat): Seat | null {
  for (let offset = 1; offset <= MAX_PLAYERS; offset++) {
    const seat = ((fromSeat - 1 + offset) % MAX_PLAYERS) + 1;
    if (state.activePlayers.includes(seat)) return seat;
  }
  return null;
}

export function addPlayer(
  state: GameState,
  name: string,
  random: Random = Math.random
): { state: GameState; seat: Seat } | { error: string } {
  if (state.started) return { error: 'Game already in progress' };
  if (state.activePlayers.length >= MAX_PLAYERS) return { error: 'Game is full' };

  let seat = 1;
  while (state.activePlayers.includes(seat)) seat++;
  const activePlayers = [...state.activePlayers, seat].sort((a, b) => a - b);
  const next = withLobbyDefaults({
    ...state,
    activePlayers,
    playerNames: { ...state.playerNames, [seat]: name },
    gameStatus: `${name} joined (${activePlayers.length}/${MAX_PLAYERS} players)`
  }, random);
  return { state: next, seat };
}

export function removePlayer(state: GameState, seat: Seat, random: Random = Math.random): GameState {
  const name = state.playerNames[seat];
  const activePlayers = state.activePlayers.filter(s => s !== seat);

  if (!state.started) {
    return withLobbyDefaults({
      ...state,
      activePlayers,
      playerNames: without(state.playerNames, seat),
      gameStatus: `${name} left`
    }, random);
  }

  // Mid-game: the board stays and is still scored, the seat is skipped from now on
  const next: GameState = { ...state, activePlayers, gameStatus: `${name} left the game` };
  if (state.isGameOver) return next;

  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    return {
      ...next,
      isGameOver: true,
      currentPlayer: null,
      winners: [winner],
      gameStatus: `${state.playerNames[winner]} wins! Everyone else left.`
    };
  }

  if (state.currentPlayer === seat) {
    next.currentPlayer = nextActivePlayer(next, seat);
  }
  return next;
}

export function toPublicState(state: GameState): PublicGameState {
  const { bag: _bag, lid: _lid, roundStarter: _roundStarter, markerHolder: _markerHolder, ...view } = state;
  return view;
}

function isColor(item: unknown): item is Color {
  return COLORS.some(color => color === item);
}

function isLine(value: unknown): value is number | 'floor' {
  return value === 'floor' ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < LINE_COUNT);
}

// Reads a move as it arrives over the network, or null if it is not shaped like one
function parseMove(move: unknown): Move | null {
  const input = asRecord(move);
  const source = asRecord(input?.source);
  const color = input?.color;
  const line = input?.line;
  if (!source || !isColor(color) || !isLine(line)) return null;

  if (source.type === 'center') return { source: { type: 'center' }, color, line };
  if (source.type === 'factory' && typeof source.index === 'number' && Number.isInteger(source.index)) {
    return { source: { type: 'factory', index: source.index }, color, line };
  }
  return null;
}

// Moves each full pattern line onto the wall, then charges for the floor line.
// `discarded` is what goes to the lid.
function tileWall(board: PlayerBoard): { board: PlayerBoard; discarded: Color[] } {
  const wall = board.wall.map(row => [...row]);
  const discarded: Color[] = [];
  let score = board.score;

  const patternLines = board.patternLines.map((line, row) => {
    if (line.color === null || line.count < row + 1) return line;
    const col = wallColumn(row, line.color);
    wall[row][col] = true;
    score += scorePlacement(wall, row, col);
    discarded.push(...Array<Color>(row).fill(line.color)); // one tile stays on the wall
    return { color: null, count: 0 };
  });

  score = Math.max(0, score - floorPenalty(board.floor));
  discarded.push(...board.floor.filter(isColor));
  return { board: { patternLines, wall, floor: [], score }, discarded };
}

function mapBoards(
  boards: Record<Seat, PlayerBoard>,
  change: (board: PlayerBoard) => PlayerBoard
): Record<Seat, PlayerBoard> {
  return Object.fromEntries(Object.entries(boards).map(([seat, board]) => [seat, change(board)]));
}

// Adds the bonuses and picks the winners among the players still in the game:
// most points, then most complete rows; a tie on both is shared
function endGame(state: GameState): GameState {
  const boards = mapBoards(state.boards, board => ({ ...board, score: board.score + endGameBonus(board.wall) }));
  const best = (seats: Seat[], measure: (board: PlayerBoard) => number): Seat[] => {
    const top = Math.max(...seats.map(seat => measure(boards[seat])));
    return seats.filter(seat => measure(boards[seat]) === top);
  };
  const winners = best(best(state.activePlayers, board => board.score), board => completeRows(board.wall));
  const names = winners.map(seat => state.playerNames[seat]);
  const points = boards[winners[0]].score;

  return {
    ...state,
    boards,
    isGameOver: true,
    currentPlayer: null,
    winners,
    gameStatus: winners.length === 1
      ? `${names[0]} wins with ${points} points!`
      : `${names.join(' and ')} share the win with ${points} points!`
  };
}

// Runs once the factories and the centre are empty
function endRound(state: GameState, random: Random): GameState {
  const lid = [...state.lid];
  const boards = mapBoards(state.boards, board => {
    const tiled = tileWall(board);
    lid.push(...tiled.discarded);
    return tiled.board;
  });
  const scored: GameState = { ...state, boards, lid };

  if (Object.values(boards).some(board => completeRows(board.wall) > 0)) return endGame(scored);

  const dealt = deal(state.bag, lid, state.factories.length, random);
  if (dealt.factories.every(factory => factory.length === 0)) return endGame(scored);

  // The marker holder starts. If nobody took the marker, the same player starts again.
  const preferred = state.markerHolder ?? state.roundStarter ?? state.activePlayers[0];
  const starter = state.activePlayers.includes(preferred) ? preferred : nextActivePlayer(state, preferred);
  const starterName = starter === null ? '' : state.playerNames[starter];

  return {
    ...scored,
    ...dealt,
    center: [],
    centerHasMarker: true,
    markerHolder: null,
    roundStarter: starter,
    currentPlayer: starter,
    round: state.round + 1,
    gameStatus: `Round ${state.round} scored. ${starterName} starts round ${state.round + 1}.`
  };
}

export function applyMove(state: GameState, seat: Seat, move: unknown, random: Random = Math.random): Result<GameState> {
  if (state.isGameOver) return { error: 'The game is over' };
  if (state.activePlayers.length < 2) return { error: 'Waiting for more players' };
  if (state.currentPlayer !== seat) return { error: 'Not your turn' };

  const parsed = parseMove(move);
  if (!parsed) return { error: 'Invalid move' };
  const { source, color, line } = parsed;

  const tiles = sourceTiles(state, source);
  const count = tiles.filter(tile => tile === color).length;
  if (count === 0) return { error: 'No tiles of that colour there' };

  const board = state.boards[seat];
  if (line !== 'floor' && !canPlaceOnLine(board, line, color)) return { error: 'Those tiles cannot go on that line' };

  const fromFactory = source.type === 'factory';
  const rest = tiles.filter(tile => tile !== color);
  const takesMarker = !fromFactory && state.centerHasMarker;
  const factories = fromFactory
    ? state.factories.map((factory, index) => (index === source.index ? [] : factory))
    : state.factories;
  const center = fromFactory ? [...state.center, ...rest] : rest;

  const placed = line === 'floor' ? 0 : Math.min(count, line + 1 - board.patternLines[line].count);
  const patternLines = board.patternLines.map((patternLine, index) =>
    index === line ? { color, count: patternLine.count + placed } : patternLine);

  // The marker goes down first; whatever does not fit on the floor line is discarded
  const dropped: FloorItem[] = [...(takesMarker ? ['first' as const] : []), ...Array<Color>(count - placed).fill(color)];
  const room = FLOOR_PENALTIES.length - board.floor.length;
  const floor = [...board.floor, ...dropped.slice(0, room)];
  const lid = [...state.lid, ...dropped.slice(room).filter(isColor)];

  const where = fromFactory ? `factory ${source.index + 1}` : 'the centre';
  const next: GameState = {
    ...state,
    started: true, // Locks joining
    factories,
    center,
    centerHasMarker: state.centerHasMarker && !takesMarker,
    markerHolder: takesMarker ? seat : state.markerHolder,
    lid,
    boards: { ...state.boards, [seat]: { ...board, patternLines, floor } },
    lastMove: { playerNumber: seat, source, color, count, line },
    gameStatus: `${state.playerNames[seat]} took ${count} ${color} from ${where}`
  };

  const tableEmpty = center.length === 0 && factories.every(factory => factory.length === 0);
  if (tableEmpty) return { state: endRound(next, random) };
  return { state: { ...next, currentPlayer: nextActivePlayer(next, seat) } };
}
