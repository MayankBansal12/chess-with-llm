import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function SimpleThemeToggle() {
  const { setTheme } = useTheme();
  const [currentTheme, setCurrentTheme] = useState("system");

  const themes = ["light", "dark", "system"] as const;
  const icons = {
    dark: <Moon className="size-4" />,
    light: <Sun className="size-4" />,
    system: <Monitor className="size-4" />,
  };

  const cycleTheme = () => {
    const currentIndex = themes.indexOf(
      currentTheme as (typeof themes)[number]
    );
    const nextIndex = (currentIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];

    setCurrentTheme(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <Button
      onClick={cycleTheme}
      size="icon"
      title={`Current theme: ${currentTheme}`}
      variant="outline"
    >
      {icons[currentTheme as keyof typeof icons]}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
