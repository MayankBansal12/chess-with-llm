import { Crown } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PromotionPiece = "q" | "r" | "b" | "n";

interface PromotionDialogProps {
  color: "w" | "b";
  isOpen: boolean;
  onCancel: () => void;
  onSelect: (piece: PromotionPiece) => void;
}

const PIECE_SYMBOLS = {
  b: { b: "♝", n: "♞", q: "♛", r: "♜" },
  w: { b: "♗", n: "♘", q: "♕", r: "♖" },
} as const;

const PROMOTION_PIECES = [
  { name: "Queen", type: "q" },
  { name: "Rook", type: "r" },
  { name: "Bishop", type: "b" },
  { name: "Knight", type: "n" },
] as const satisfies ReadonlyArray<{ name: string; type: PromotionPiece }>;

interface PromotionOptionProps {
  color: "w" | "b";
  name: string;
  onSelect: (piece: PromotionPiece) => void;
  type: PromotionPiece;
}

function PromotionOption({
  color,
  name,
  onSelect,
  type,
}: PromotionOptionProps) {
  const handleSelect = useCallback(() => {
    onSelect(type);
  }, [onSelect, type]);

  return (
    <Button
      className="flex h-20 flex-col items-center gap-2 p-2"
      onClick={handleSelect}
      variant="outline"
    >
      <span className="text-4xl">{PIECE_SYMBOLS[color][type]}</span>
      <span className="text-xs">{name}</span>
    </Button>
  );
}

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
            {PROMOTION_PIECES.map(({ name, type }) => (
              <PromotionOption
                color={color}
                key={type}
                name={name}
                onSelect={onSelect}
                type={type}
              />
            ))}
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
