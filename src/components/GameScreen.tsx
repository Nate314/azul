import { useState, useEffect } from 'react';
import gameService from '../services/gameService';
import Factories from './Factories';
import GameStatus from './GameStatus';
import PlayerBoard from './PlayerBoard';
import type { Selection } from '../selection.ts';
import type { PublicGameState, Seat } from '../../shared/types.ts';

type GameScreenProps = {
  gameState: PublicGameState;
  playerNumber: Seat;
  error: string | null;
};

export default function GameScreen({ gameState, playerNumber, error }: GameScreenProps) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const { currentPlayer, activePlayers, playerNames, boards, isGameOver, winners, round } = gameState;
  const isMyTurn = currentPlayer === playerNumber && activePlayers.length >= 2 && !isGameOver;

  useEffect(() => {
    // Nothing stays picked up across turns or rounds
    setSelection(null);
  }, [currentPlayer, round]);

  function place(line: number | 'floor') {
    if (!selection) return;
    gameService.makeMove({ ...selection, line });
    setSelection(null);
  }

  let hint: string | null = null;
  if (isMyTurn) {
    hint = selection
      ? `Place the ${selection.color} tiles on a highlighted line, or on the floor`
      : 'Your turn: pick tiles from a factory or the centre';
  }

  function renderBoard(seat: Seat) {
    const isMe = seat === playerNumber;
    return (
      <PlayerBoard
        key={seat}
        board={boards[seat]}
        name={playerNames[seat]}
        isMe={isMe}
        isCurrent={currentPlayer === seat}
        hasLeft={!activePlayers.includes(seat)}
        isWinner={winners.includes(seat)}
        selectedColor={isMe && isMyTurn && selection ? selection.color : null}
        onPlace={place}
      />
    );
  }

  const otherSeats = Object.keys(boards).map(Number).filter(seat => seat !== playerNumber).sort((a, b) => a - b);

  return (
    <>
      <div className="game-id">Game ID: {gameState.gameId}</div>
      <div className="game-screen">
        <div className="game-info">
          <div className="player-info">
            You are {playerNames[playerNumber]} (Player {playerNumber})
          </div>
          <GameStatus gameState={gameState} error={error} hint={hint} />
        </div>
        <Factories gameState={gameState} isMyTurn={isMyTurn} selection={selection} onSelect={setSelection} />
        <div className="boards">
          {renderBoard(playerNumber)}
          {otherSeats.length > 0 && <div className="other-boards">{otherSeats.map(renderBoard)}</div>}
        </div>
      </div>
    </>
  );
}
