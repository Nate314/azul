import { createGameState, addPlayer, removePlayer, applyMove, toPublicState } from '../shared/rules.ts';
import type { GameState, PublicGameState, Result, Seat } from '../shared/types.ts';

const MAX_NAME_LENGTH = 20; // applies to player names and game IDs

export type JoinResult = { gameId: string; seat: Seat; state: PublicGameState } | { error: string };

// Holds every game in memory. Only the public view of a game ever leaves this module.
export function createGameManager() {
  const games = new Map<string, GameState>();

  function findPlayer(gameId: string, seat: Seat): { game: GameState } | { error: string } {
    const game = games.get(gameId);
    if (!game) return { error: 'Game not found' };
    if (!game.activePlayers.includes(seat)) return { error: 'You are not in this game' };
    return { game };
  }

  return {
    join(gameId: unknown, playerName: unknown): JoinResult {
      const id = String(gameId ?? '').trim().slice(0, MAX_NAME_LENGTH);
      const name = String(playerName ?? '').trim().slice(0, MAX_NAME_LENGTH);
      if (!id) return { error: 'Please enter a game ID' };
      if (!name) return { error: 'Please enter your name' };

      const result = addPlayer(games.get(id) ?? createGameState(id), name);
      if ('error' in result) return result;

      games.set(id, result.state);
      return { gameId: id, seat: result.seat, state: toPublicState(result.state) };
    },

    leave(gameId: string, seat: Seat): { state: PublicGameState } | null {
      const found = findPlayer(gameId, seat);
      if ('error' in found) return null;

      const next = removePlayer(found.game, seat);
      if (next.activePlayers.length === 0) {
        games.delete(gameId);
        return null;
      }
      games.set(gameId, next);
      return { state: toPublicState(next) };
    },

    move(gameId: string, seat: Seat, move: unknown): Result<PublicGameState> {
      const found = findPlayer(gameId, seat);
      if ('error' in found) return found;

      const result = applyMove(found.game, seat, move);
      if ('error' in result) return result;

      games.set(gameId, result.state);
      return { state: toPublicState(result.state) };
    },

    getState(gameId: string): PublicGameState | undefined {
      const game = games.get(gameId);
      return game && toPublicState(game);
    }
  };
}
