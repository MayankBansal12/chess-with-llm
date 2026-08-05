import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import BrandMark from "./brand-mark";
import SimpleThemeToggle from "./ui/simple-theme-toggle";

export default function Header() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return (
    <header
      className={cn(
        "relative z-10",
        isHome ? "bg-transparent" : "bg-background"
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6">
        <Link
          className="flex items-center gap-3 rounded-lg font-semibold text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          to="/"
        >
          <BrandMark className="size-9 text-primary" />
          <span className="leading-none">Chess with LLM</span>
        </Link>
        <SimpleThemeToggle />
      </div>
    </header>
  );
}
