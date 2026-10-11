// Data shapes shared by the browser and the server

export type Seat = number; // A player number, 1 to 4

export type Color = 'blue' | 'yellow' | 'red' | 'black' | 'cyan';

// 'first' is the first-player marker
export type FloorItem = Color | 'first';

export type PatternLine = { color: Color | null; count: number };

export type PlayerBoard = {
  patternLines: PatternLine[]; // 5 lines; line i holds up to i + 1 tiles
  wall: boolean[][];           // 5x5, true where a tile is placed
  floor: FloorItem[];          // at most 7
  score: number;
};

export type Source = { type: 'factory'; index: number } | { type: 'center' };

export type Move = { source: Source; color: Color; line: number | 'floor' };

export type LastMove = Move & { playerNumber: Seat; count: number };

// The game state as the server sends it to browsers
export type PublicGameState = {
  gameId: string;
  started: boolean;
  round: number;
  currentPlayer: Seat | null;
  activePlayers: Seat[];
  playerNames: Record<Seat, string>;
  factories: Color[][];
  center: Color[];
  centerHasMarker: boolean;
  boards: Record<Seat, PlayerBoard>;
  lastMove: LastMove | null;
  gameStatus: string;
  isGameOver: boolean;
  winners: Seat[];
};

// The full state, which never leaves the server: nobody can count the bag
export type GameState = PublicGameState & {
  bag: Color[];
  lid: Color[];
  roundStarter: Seat | null;  // who took the first turn this round
  markerHolder: Seat | null;  // who took the first-player marker this round
};

export type Result<T> = { state: T } | { error: string };
