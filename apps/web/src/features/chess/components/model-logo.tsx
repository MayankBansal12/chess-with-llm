import { cn } from "@/lib/utils";

interface ModelLogoProps {
  className?: string;
  logoUrl: string;
  name: string;
}

export default function ModelLogo({
  className,
  logoUrl,
  name,
}: ModelLogoProps) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background ring-1 ring-border",
        className
      )}
    >
      <img
        alt={`${name} logo`}
        className="size-full object-contain p-1.5"
        decoding="async"
        draggable={false}
        height={128}
        referrerPolicy="no-referrer"
        src={logoUrl}
        width={128}
      />
    </span>
  );
}
