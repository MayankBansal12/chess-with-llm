import { motion } from "framer-motion";
import { Play } from "lucide-react";
import { Link } from "react-router";
import AsciiHeading from "@/components/home/ascii-heading";
import { Button } from "@/components/ui/button";
import type { Route } from "./+types/_index";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Chess with LLM" },
    { content: "Play chess with AI assistance", name: "description" },
  ];
}

export default function Home() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="flex max-w-2xl flex-col items-center space-y-8 text-center">
        <AsciiHeading />

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
          initial={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.8, duration: 0.6, ease: "easeOut" }}
        >
          <h1
            className="font-medium text-2xl md:text-3xl"
            style={{ color: "var(--foreground)" }}
          >
            Play Chess with AI Assistance
          </h1>
          <p className="text-muted-foreground">
            Experience chess with intelligent move suggestions and analysis
          </p>
        </motion.div>

        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          initial={{ opacity: 0, scale: 0.9 }}
          transition={{ delay: 1, duration: 0.4, ease: "easeOut" }}
        >
          <Link to="/game">
            <Button className="flex items-center space-x-2 text-base" size="lg">
              <Play className="size-5" />
              <span>Start Game</span>
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
