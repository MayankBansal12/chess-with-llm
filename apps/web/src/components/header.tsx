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
        <div className="flex items-center gap-2">
          <nav aria-label="Primary navigation" className="flex items-center">
            <Link
              className={cn(
                "rounded-md px-3 py-2 font-medium text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                pathname === "/tournament"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground"
              )}
              to="/tournament"
            >
              Tournament
            </Link>
          </nav>
          <SimpleThemeToggle />
        </div>
      </div>
    </header>
  );
}
