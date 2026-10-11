# Azul multiplayer game: design

Date: 2026-10-11

## Goal

A web-based, real-time multiplayer Azul for two to four players, built the same way as the
Quoridor project in `../quoridor`: same stack, same file layout, same code conventions, same
packaging. Rules follow the standard game as summarised at https://buddyboardgames.com/azul.

## Decisions already made

- New sibling project `azul/` with its own git repo and full scaffolding parity with Quoridor:
  Dockerfile, `docker-compose.yml`, `compose-launcher` submodule, `run.sh` / `run.ps1` stubs,
  `run.conf`, GitHub Actions CI, ESLint, `.nvmrc`.
- Two to four players, seated in join order. Joining locks after the first move.
- No undo feature.

## Out of scope

- Undo, spectators, reconnecting to a seat after a disconnect, saved games, AI players.
- The variant (grey) wall, where players choose which column a tile goes in.
- Animations for tiles moving at the end of a round.

## Architecture

Identical to Quoridor. One Node process serves the built React client over HTTP and runs the
WebSocket server on the same port (3000). The server runs its TypeScript sources directly
(Node 22.18+), so there is no server build step.

```
azul/
  shared/    types.ts, messages.ts, rules.ts, rules.test.ts
  server/    server.ts, games.ts, games.test.ts
  src/       main.tsx, App.tsx, components/, hooks/, services/
```

- `shared/rules.ts` holds every rule as pure functions over immutable state. The browser uses it
  to show which picks and lines are legal; the server uses it to validate every move.
- `server/games.ts` is the game manager: `join`, `leave`, `move`, `getState`. It holds games in
  memory and turns the full state into the public state before anything is sent.
- `server/server.ts` is Quoridor's server with the undo messages removed.
- The client talks to the server through `src/services/gameService.ts` and
  `src/hooks/useGameConnection.ts`, as in Quoridor.

## Rules

### Components

- Five colours: blue, yellow, red, black, cyan. 100 tiles, 20 of each.
- Factories: 5 for two players, 7 for three, 9 for four. Each holds up to 4 tiles.
- The centre: a pool of tiles, plus the first-player marker at the start of each round.
- The bag (tiles to be drawn) and the lid (discarded tiles).
- Each player has a board:
  - Five pattern lines. Line `i` (0 to 4) holds up to `i + 1` tiles, all one colour.
  - A 5x5 wall with a fixed colour layout. The colour at row `r`, column `c` is
    `COLORS[(c - r + 5) % 5]`, with `COLORS = [blue, yellow, red, black, cyan]`. So each colour
    appears once in every row and every column.
  - A floor line of 7 slots with penalties -1, -1, -2, -2, -2, -3, -3.
  - A score, starting at 0.

### Lobby

Players join by game ID and name and take the lowest free seat (1 to 4). While the game has not
started, each join or leave deals afresh for the current player count: a full shuffled bag, the
right number of factories filled with 4 tiles each, the marker in the centre, empty boards. With
only one player seated, nothing is dealt and the table is empty. The lowest seat takes the first
turn. A move needs at least two players. The first move sets
`started` and locks joining.

### A turn

The current player sends one move: a source, a colour, and a destination.

- Source: a factory (by index) or the centre.
- Colour: the source must hold at least one tile of that colour.
- Destination: a pattern line (0 to 4) or the floor.

A pattern line is a legal destination when all of these hold:

- it is empty, or already holds that colour;
- it is not full;
- the wall space for that colour in that row is empty.

The floor is always a legal destination, so a player always has a legal move.

Applying the move:

1. The player takes every tile of that colour from the source.
2. From a factory, the factory's remaining tiles move to the centre. From the centre, if the
   marker is still there, the player takes it as well and it goes on their floor line first.
3. Tiles fill the chosen pattern line up to its capacity. Tiles that do not fit go to the floor
   line. With the floor as the destination, all of them go to the floor line.
4. The floor line holds 7 items. Tiles that do not fit go to the lid. A marker that does not fit
   is set aside; the player still holds it for the next round.
5. If every factory and the centre are now empty of tiles, the round ends (below). Otherwise the
   turn passes to the next active seat.

### End of a round

All in the same step as the move that emptied the table, for every board (including boards of
players who have left):

1. For each full pattern line, top to bottom: place one tile on the wall space of that colour in
   that row, score it, and move the line's other tiles to the lid. Lines that are not full keep
   their tiles.
2. Scoring a placed tile: count the unbroken horizontal run of wall tiles through it (including
   it) and the unbroken vertical run. If both are 1, score 1. Otherwise score the sum of the runs
   that are longer than 1. (A tile joining a row of 3 and a column of 2 scores 5.)
3. Subtract the floor penalties for the occupied floor slots. The marker counts as an occupied
   slot. A score never drops below 0. Floor tiles go to the lid.
4. If any board now has a complete horizontal wall row, the game ends (below).
5. Otherwise start the next round: refill each factory with 4 tiles from the bag. When the bag
   runs out, shuffle the lid into the bag and keep going. If both run out, the remaining
   factories stay short or empty. The marker returns to the centre. The player who held the
   marker takes the first turn; if they have left, the next active seat does. If nobody took the
   marker (the centre never received tiles), the player who started this round starts again. If
   no tiles at all could be dealt, the game ends.

### End of the game

Each board gets its bonuses: +2 for each complete wall row, +7 for each complete column, +10 for
each colour with all five tiles on the wall.

The winner is the active player with the highest score. Ties go to the player with more complete
rows. A tie on both is a shared win, so the state holds `winners: Seat[]`.

### Leaving

- Before the start: the seat is freed and the lobby deals afresh.
- Mid-game: the board stays and is still scored each round, the seat's turns are skipped, and the
  player cannot win. If only one player remains, they win at once. If the last player leaves, the
  game is deleted.

## Data shapes (`shared/types.ts`)

```ts
type Seat = number;                       // 1 to 4
type Color = 'blue' | 'yellow' | 'red' | 'black' | 'cyan';
type FloorItem = Color | 'first';         // 'first' is the first-player marker
type PatternLine = { color: Color | null; count: number };
type PlayerBoard = {
  patternLines: PatternLine[];            // 5 lines
  wall: boolean[][];                      // 5x5, true where a tile is placed
  floor: FloorItem[];                     // at most 7
  score: number;
};
type Source = { type: 'factory'; index: number } | { type: 'center' };
type Move = { source: Source; color: Color; line: number | 'floor' };
type LastMove = { playerNumber: Seat; source: Source; color: Color; count: number; line: number | 'floor' };

type PublicGameState = {
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

// Server only
type GameState = PublicGameState & {
  bag: Color[];
  lid: Color[];
  roundStarter: Seat | null;              // who took the first turn this round
  markerHolder: Seat | null;              // who took the marker this round
};

type Result<T> = { state: T } | { error: string };
```

The bag and the lid never leave the server, which matches the physical game: nobody can count
what is left in the bag. This is the one structural difference from Quoridor, where the public
state is the full state plus one field.

## Rules module (`shared/rules.ts`)

Exports, all pure:

- Constants: `COLORS`, `MAX_PLAYERS`, `FLOOR_PENALTIES`, `LINE_COUNT`.
- Geometry: `wallColor(row, col)`, `wallColumn(row, color)`, `factoryCount(playerCount)`.
- Hints, used by the browser and by validation: `canPlaceOnLine(board, line, color)`,
  `legalLines(board, color)`, `sourceColors(state, source)`.
- Scoring: `scorePlacement(wall, row, col)`, `floorPenalty(floor)`, `endGameBonus(wall)`.
- State: `createGameState(gameId)`, `addPlayer`, `removePlayer`, `applyMove`,
  `nextActivePlayer`, `toPublicState`.

`addPlayer`, `removePlayer` and `applyMove` take an optional `random: () => number` (default
`Math.random`), used only for shuffling, so tests can pass a fixed sequence. The hint functions
read only public fields, so the browser can call them with the public state.

`applyMove(state, seat, move: unknown)` validates untrusted input field by field with `asRecord`,
as Quoridor does. Error messages: `The game is over`, `Waiting for more players`,
`Not your turn`, `Invalid move`, `No tiles of that colour there`, `Those tiles cannot go on that
line`.

## Messages (`shared/messages.ts`)

`JOIN_GAME`, `GAME_JOINED`, `MAKE_MOVE`, `GAME_STATE`, `GAME_ERROR`, with Quoridor's payload
shapes and `asRecord`. No undo messages.

## Client

- `Game.tsx` shows `JoinForm.tsx` until seated, then `GameScreen.tsx`.
- `GameScreen.tsx` lays out the screen and owns the selection (a source and a colour).
- `GameStatus.tsx`: status text, round number, whose turn, the winner line.
- `Factories.tsx`: the factory circles and the centre pool, with the marker. On your turn,
  clicking a tile selects every tile of that colour in that source.
- `PlayerBoard.tsx`: one player's pattern lines, wall, floor line and score. Your own board is
  large; the others are smaller, beside it. With a selection active, your legal pattern lines
  and your floor line are highlighted, and clicking one sends the move.
- `Tile.tsx`: one coloured tile. Each colour also has its own mark, so colours are not told apart
  by hue alone.
- `ThemeToggle.tsx`: light and dark mode, as in Quoridor.

Empty wall spaces show their colour faintly. The last move is described in the status text and
its source highlighted. The table is dimmed when it is not your turn. Errors from the server
show the same way as in Quoridor.

## Testing

`node --test`, as in Quoridor.

- `shared/rules.test.ts`: wall layout; legal lines (wrong colour, full line, wall space taken);
  taking from a factory moves the rest to the centre; the first centre pick takes the marker;
  overflow to the floor and past the floor to the lid; placement scoring (alone, row only,
  column only, both); floor penalties and the zero floor on scores; unfinished lines carry over;
  the marker holder starts the next round; refilling from the lid when the bag runs out; the
  end-of-game trigger, bonuses, and tie-break; leaving in the lobby and mid-game; every tile is
  always in exactly one place (100 in total).
- `server/games.test.ts`: joining and seating, input trimming, full game, joining after the
  start, moves by the wrong player, the public state has no bag or lid, leaving.

The UI is checked by running the server and playing a game in the browser across two windows.

## Delivery

Scripts as in Quoridor: `dev`, `typecheck`, `build`, `lint`, `start`, `test`. The Dockerfile,
`docker-compose.yml`, launcher stubs, `run.conf` (`port APP_PORT 3000`, `url Azul: ...`), CI
workflow, ESLint and TypeScript configs are copied from Quoridor and renamed. The README and
`docs/architecture.md` are rewritten for Azul.
