import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PromotionDialogProps {
  isOpen: boolean;
  color: "w" | "b";
  onSelect: (piece: "q" | "r" | "b" | "n") => void;
  onCancel: () => void;
}

const pieces = {
  w: { q: "♕", r: "♖", b: "♗", n: "♘" },
  b: { q: "♛", r: "♜", b: "♝", n: "♞" },
};

const pieceNames = {
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
};

export default function PromotionDialog({
  isOpen,
  color,
  onSelect,
  onCancel,
}: PromotionDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="sm:max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="size-5" />
            Choose Promotion Piece
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-muted-foreground">
            Select the piece to promote your pawn to
          </p>

          <div className="grid grid-cols-4 gap-2">
            {Object.entries(pieces[color]).map(([type, symbol]) => {
              return (
                <Button
                  className="flex h-20 flex-col items-center gap-2 p-2"
                  key={type}
                  onClick={() => onSelect(type as "q" | "r" | "b" | "n")}
                  variant="outline"
                >
                  <span className="text-4xl">{symbol}</span>
                  <span className="text-xs">
                    {pieceNames[type as keyof typeof pieceNames]}
                  </span>
                </Button>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={onCancel} variant="ghost">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
