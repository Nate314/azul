import type { PublicGameState } from '../../shared/types.ts';

type GameStatusProps = {
  gameState: PublicGameState;
  error: string | null;
  hint: string | null;
};

function turnMessage({ currentPlayer, playerNames, activePlayers, started, isGameOver, round }: PublicGameState): string {
  const currentName = currentPlayer === null ? '' : playerNames[currentPlayer];
  if (isGameOver) return 'Game over';
  if (activePlayers.length < 2) return 'Waiting for at least one more player';
  if (!started) return `${currentName} goes first. Joining closes after the first move.`;
  return `Round ${round}: ${currentName}'s turn`;
}

export default function GameStatus({ gameState, error, hint }: GameStatusProps) {
  const { gameStatus } = gameState;

  return (
    <>
      {(error || gameStatus) && (
        <div className={error ? 'game-status game-status-error' : 'game-status'}>
          {error || gameStatus}
        </div>
      )}
      <div className="turn-message">{turnMessage(gameState)}</div>
      <div className="hint">{hint}</div>
    </>
  );
}
