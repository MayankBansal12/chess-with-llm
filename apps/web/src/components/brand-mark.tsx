import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
}

export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-8", className)}
      fill="none"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="currentColor" height="48" rx="11" width="48" />
      <path
        d="M16 35h20M18.5 31h15l-1.2-5.2a10.8 10.8 0 0 0-5.2-6.9l-1.6-1V13h-5v7.1l-3.2 3.2 4.2 3.2-3 4.5Z"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
      <circle cx="28.5" cy="13" fill="white" r="1.5" />
      <path
        d="M12 14h4m-2-2v4M34 10h3m-1.5-1.5v3"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}
