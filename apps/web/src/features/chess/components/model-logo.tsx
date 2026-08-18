import { cn } from "@/lib/utils";

interface ModelLogoProps {
  className?: string;
  imageClassName?: string;
  logoUrl: string;
  name: string;
}

const OPENAI_LOGO_PATTERN = /(?:openai|chatgpt|^gpt[-\s]|^o\d)/i;

export default function ModelLogo({
  className,
  imageClassName,
  logoUrl,
  name,
}: ModelLogoProps) {
  const isOpenAiLogo = OPENAI_LOGO_PATTERN.test(`${name} ${logoUrl}`);

  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background ring-1 ring-border",
        className
      )}
    >
      <img
        alt={`${name} logo`}
        className={cn(
          "size-full object-contain p-1.5",
          isOpenAiLogo && "dark:invert",
          imageClassName
        )}
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
