import { Crown } from "lucide-react";
import { Link } from "react-router";
import SimpleThemeToggle from "./ui/simple-theme-toggle";

export default function Header() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link className="flex items-center gap-2 font-medium text-sm" to="/">
          <span className="flex size-7 items-center justify-center bg-primary text-primary-foreground">
            <Crown className="size-4" />
          </span>
          Chess with LLM
        </Link>
        <SimpleThemeToggle />
      </div>
    </header>
  );
}
