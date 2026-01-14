import { motion } from "framer-motion";
import { Check, Copy, Trophy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { GameStatus } from "@/features/chess/hooks/use-chess-game";

interface GameOverDialogProps {
  isOpen: boolean;
  gameStatus: GameStatus;
  moveCount: number;
  winner: "white" | "black" | null;
  onNewGame: () => void;
}

export default function GameOverDialog({
  isOpen,
  gameStatus,
  moveCount,
  winner,
  onNewGame,
}: GameOverDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) {
    return null;
  }

  const getTitle = (): string => {
    switch (gameStatus) {
      case "checkmate": {
        return "Checkmate!";
      }
      case "stalemate": {
        return "Stalemate";
      }
      case "draw": {
        return "Draw";
      }
      default: {
        return "Game Over";
      }
    }
  };

  const getWinnerText = (): string => {
    if (gameStatus === "draw" || gameStatus === "stalemate") {
      return "Game Drawn";
    }
    if (winner === "white") {
      return "White Wins";
    }
    return "Black Wins";
  };

  const getWinnerColorClass = (): string => {
    if (winner === "white") {
      return "text-primary";
    }
    if (winner === "black") {
      return "text-foreground";
    }
    return "text-muted-foreground";
  };

  const handleCopyPgn = async () => {
    try {
      await navigator.clipboard.writeText("[Game copied to clipboard]");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy PGN");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm"
        initial={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-xl">
              <Trophy className="size-5" />
              {getTitle()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`flex items-center justify-center gap-2 font-semibold text-lg ${getWinnerColorClass()}`}
            >
              {winner === "white" && <span className="text-3xl">♔</span>}
              {winner === "black" && <span className="text-3xl">♚</span>}
              <span>{getWinnerText()}</span>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <span className="text-muted-foreground">Total Moves: </span>
              <span className="font-medium">{moveCount}</span>
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button
              className="flex-1"
              onClick={handleCopyPgn}
              variant="outline"
            >
              {copied ? (
                <>
                  <Check className="mr-2 size-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 size-4" />
                  Copy PGN
                </>
              )}
            </Button>
            <Button className="flex-1" onClick={onNewGame}>
              New Game
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
