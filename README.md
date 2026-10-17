# Azul Multiplayer Game
r
> **Deprecated:** this game now lives in [Nate314/multiplayer-tabletop-games](https://github.com/Nate314/multiplayer-tabletop-games).

A web-based implementation of the Azul board game for two to four players.

## Setup and Running

1. Use Node.js 22.18 or newer (the server runs its TypeScript files directly). With nvm:

```bash
nvm install 22
nvm use 22
```

2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm run start
```

This type-checks the code, builds the client, and starts the server. Open `http://localhost:3000`. To use another port, set the `PORT` environment variable.

## Run with Docker

With Docker installed (no local Node needed):

```bash
docker compose up --build
```

Then open `http://localhost:3000`. To use a different host port, set `APP_PORT`:

```bash
APP_PORT=3055 docker compose up --build        # macOS, Linux, Git Bash
```

```powershell
$env:APP_PORT = 3055; docker compose up --build   # Windows PowerShell
```

### Running next to other projects

The launcher picks a free host port, writes it to a git-ignored `.env`, starts the game in the background and prints the URL:

```
./run.sh          # macOS, Linux, Git Bash
.\run.ps1         # Windows PowerShell
```

Arguments are passed straight to `docker compose`, for example `./run.sh down` or `./run.sh logs -f`. The launcher lives in [compose-launcher](https://github.com/Nate314/compose-launcher), included here as a git submodule. The first launcher run fetches it, which needs network access and a real git clone. The port and the printed URL are configured in `run.conf`.

## Development

- `npm test` runs the unit tests
- `npm run typecheck` checks the TypeScript types for the browser and server code
- `npm run lint` runs ESLint
- `npm run dev` starts the Vite dev server for the browser code (UI only; play games through `npm start`)

## How to Play Multiplayer

1. Open the game in two to four browser windows
2. In each window, enter your name and the same game ID (any string) to join the same game
3. Players are seated in join order. Player 1 takes the first turn once at least two players have joined
4. Nobody can join after the first move

To play across computers on the same network, open `http://<server-ip>:3000` on each one.

## Game Rules

Each round, players take turns picking tiles and placing them on their own board.

- **Picking.** Take every tile of one colour from one factory; the factory's other tiles move to the centre. Or take every tile of one colour from the centre. The first player to take from the centre in a round also takes the first-player marker, which goes on their floor line.
- **Placing.** Put the tiles on one of your five pattern lines. A line holds one colour, and line 1 holds one tile up to line 5 holding five. You cannot use a line whose wall row already has that colour. Tiles that do not fit go to your floor line. You may also put all of them on the floor line.
- **End of the round.** When the factories and the centre are empty, each full pattern line moves one tile onto the wall, and lines that are not full stay as they are. A tile placed alone scores 1. Otherwise it scores the length of the row of tiles it joins plus the length of the column it joins. Then the floor line costs 1, 1, 2, 2, 2, 3 and 3 points for its seven spaces. A score never drops below zero. A scoring screen shows why everyone scored what they did, and the next round is dealt once every player has pressed Continue. Whoever holds the marker starts the next round.
- **End of the game.** The game ends after the round in which someone completes a horizontal row of their wall. Bonuses: 2 points for each complete row, 7 for each complete column, and 10 for each colour placed five times. The highest score wins. A tie goes to the player with more complete rows.
- If a player leaves mid-game, their board stays and their turns are skipped. The last player left wins.
- Any player can ask to undo the last turn. It is undone only if every player still in the game approves.

## Controls

- On your turn, click a tile in a factory or the centre to pick up every tile of that colour there. Click it again to put them back
- Your legal pattern lines and your floor line are outlined. Click one to place the tiles
- The table is dimmed when it is not your turn
- The source of the last move is outlined
- Boards are shown in turn order starting with yours, so play always passes to the board on the right
- In the centre, each colour stays together on one row
- Click Undo to ask everyone to undo the last turn; it happens only if every player still in the game approves
- After each round, read the scoring screen and click Continue; the next round starts once everyone has
- Click FAQ at the top of the page for a short guide to the rules and controls

## Technical Details

- Built with React, Vite and TypeScript
- Uses WebSocket for real-time multiplayer communication
- The server validates every move with the same rules code the browser uses for hints
- Games are held in memory and are lost when the server restarts

See `docs/architecture.md` for more.
