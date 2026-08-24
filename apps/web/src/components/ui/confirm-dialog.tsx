import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { ReactElement, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  cancelLabel?: string;
  children: ReactNode;
  confirmLabel: string;
  description: string;
  isPending?: boolean;
  onConfirm: () => void;
  pendingLabel?: string;
  title: string;
}

export default function ConfirmDialog({
  cancelLabel = "Keep playing",
  children,
  confirmLabel,
  description,
  isPending = false,
  onConfirm,
  pendingLabel,
  title,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger render={children as ReactElement} />
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-black/55 opacity-100 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <AlertDialog.Popup className="w-full max-w-sm rounded-xl border bg-card p-5 text-card-foreground shadow-xl transition-[transform,opacity] duration-150 ease-out data-ending-style:scale-[0.97] data-starting-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:opacity-0">
            <AlertDialog.Title className="text-balance font-semibold text-lg">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-pretty text-muted-foreground text-sm">
              {description}
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Close
                disabled={isPending}
                render={<Button variant="ghost" />}
              >
                {cancelLabel}
              </AlertDialog.Close>
              <AlertDialog.Close
                disabled={isPending}
                onClick={onConfirm}
                render={<Button variant="destructive" />}
              >
                {isPending ? (
                  <span>{pendingLabel ?? `${confirmLabel}…`}</span>
                ) : (
                  <span>{confirmLabel}</span>
                )}
              </AlertDialog.Close>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
