import { motion } from "framer-motion";
import { Crown, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import GameOverDialog from "@/components/chess/game-over-dialog";
import PromotionDialog from "@/components/chess/promotion-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ChessBoard from "@/features/chess/components/chess-board";
import { BOARD_CONFIG } from "@/features/chess/constants/board-colors";
import { useChessGame } from "@/features/chess/hooks/use-chess-game";
import type { Route } from "./+types/game";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Chess Game" },
    { name: "description", content: "Play chess online" },
  ];
}

export default function Game() {
  const {
    position,
    selectedSquare,
    lastMove,
    moveHistory,
    gameStatus,
    statusMessage,
    currentTurn,
    isInCheck,
    promotionDialog,
    validMoves,
    handlePieceSelect,
    handleMove,
    handlePromotionSelect,
    handlePromotionCancel,
    resetGame,
  } = useChessGame();

  const moveHistoryRef = useRef<HTMLDivElement>(null);

  const getWinner = (): "white" | "black" | null => {
    if (gameStatus !== "checkmate") {
      return null;
    }
    return position.turn() === "w" ? "black" : "white";
  };

  const winner = getWinner();

  useEffect(() => {
    if (moveHistoryRef.current) {
      moveHistoryRef.current.scrollTop = moveHistoryRef.current.scrollHeight;
    }
  });

  const formatMoves = () => {
    const pairs: Array<{
      moveNumber: number;
      whiteMove: string | null;
      blackMove: string | null;
    }> = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      pairs.push({
        moveNumber: Math.floor(i / 2) + 1,
        whiteMove: moveHistory[i]?.san ?? null,
        blackMove: moveHistory[i + 1]?.san ?? null,
      });
    }
    return pairs;
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-6 md:grid-cols-1 lg:grid-cols-[1fr,400px]"
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="flex flex-col items-center gap-6">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Crown className="size-5" />
                  Chess Board
                </span>
                <Button
                  disabled={gameStatus === "active" && moveHistory.length === 0}
                  onClick={resetGame}
                  size="sm"
                  variant="outline"
                >
                  <RotateCcw className="size-4" />
                  New Game
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <ChessBoard
                boardWidth={BOARD_CONFIG.maxBoardWidth}
                game={position}
                gameStatus={gameStatus}
                isInCheck={isInCheck}
                lastMove={lastMove}
                onDrop={handleMove}
                onPieceSelect={handlePieceSelect}
                position={position.fen()}
                selectedSquare={selectedSquare}
                validMoves={validMoves}
              />
            </CardContent>
          </Card>

          <Card className="w-full lg:hidden">
            <CardHeader>
              <CardTitle>Game Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Current Turn:</span>
                  <span className="font-medium">
                    {currentTurn === "w" ? "White" : "Black"}
                  </span>
                </div>
                {gameStatus === "active" && (
                  <div
                    className={`rounded-lg p-3 text-center font-medium ${
                      isInCheck
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted/50"
                    }`}
                  >
                    {statusMessage || "Game in progress"}
                  </div>
                )}
                {gameStatus !== "active" && (
                  <div className="rounded-lg bg-primary/10 p-4 text-center font-semibold text-primary">
                    {statusMessage}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Game Status</span>
                <Button
                  disabled={gameStatus === "active" && moveHistory.length === 0}
                  onClick={resetGame}
                  size="icon"
                  title="New Game"
                  variant="ghost"
                >
                  <RefreshCw className="size-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Current Turn:</span>
                  <span className="font-medium">
                    {currentTurn === "w" ? "White" : "Black"}
                  </span>
                </div>
                {gameStatus === "active" && (
                  <div
                    className={`rounded-lg p-3 text-center font-medium ${
                      isInCheck
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted/50"
                    }`}
                  >
                    {statusMessage || "Game in progress"}
                  </div>
                )}
                {gameStatus !== "active" && (
                  <div className="rounded-lg bg-primary/10 p-4 text-center font-semibold text-primary">
                    {statusMessage}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Move History</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="max-h-[300px] space-y-2 overflow-y-auto md:max-h-[500px]"
                ref={moveHistoryRef}
              >
                {moveHistory.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">
                    No moves yet. Start playing!
                  </p>
                ) : (
                  <div className="space-y-1">
                    {formatMoves().map((pair) => (
                      <div
                        className="grid grid-cols-[auto_1fr_1fr] gap-2 rounded-md border p-2 text-sm"
                        key={pair.moveNumber}
                      >
                        <span className="text-muted-foreground">
                          {pair.moveNumber}.
                        </span>
                        <span className="font-mono">{pair.whiteMove}</span>
                        <span className="font-mono">{pair.blackMove}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button
                className="w-full"
                disabled={gameStatus === "active" && moveHistory.length === 0}
                onClick={resetGame}
                variant="default"
              >
                <RotateCcw className="mr-2 size-4" />
                New Game
              </Button>
            </CardFooter>
          </Card>
        </div>
      </motion.div>

      {promotionDialog && (
        <PromotionDialog
          color={promotionDialog.color}
          isOpen={!!promotionDialog}
          onCancel={handlePromotionCancel}
          onSelect={handlePromotionSelect}
        />
      )}

      {gameStatus !== "active" && (
        <GameOverDialog
          gameStatus={gameStatus}
          isOpen={true}
          moveCount={moveHistory.length}
          onNewGame={resetGame}
          winner={winner}
        />
      )}
    </div>
  );
}
