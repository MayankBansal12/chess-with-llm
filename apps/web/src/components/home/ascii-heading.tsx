import { motion } from "framer-motion";

export default function AsciiHeading() {
  return (
    <div className="flex flex-col items-center space-y-6">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
        initial={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="text-center font-bold font-mono text-4xl tracking-tight md:text-5xl"
          initial={{ opacity: 0, scale: 0.8 }}
          style={{
            background:
              "linear-gradient(135deg, var(--chess-green-accent), var(--chess-green-light))",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
          transition={{ delay: 0.2, duration: 0.8, ease: "easeOut" }}
        >
          CHESS WITH LLM
        </motion.div>

        <div className="flex flex-col items-center space-y-2">
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center space-x-3 text-2xl md:text-3xl"
            initial={{ opacity: 0, x: -50 }}
            transition={{ delay: 0.4, duration: 0.6, ease: "easeOut" }}
          >
            <span style={{ color: "var(--chess-green-light)" }}>♔</span>
            <span style={{ color: "var(--chess-green-dark)" }}>♕</span>
            <span style={{ color: "var(--chess-green-light)" }}>♖</span>
            <span style={{ color: "var(--chess-green-dark)" }}>♗</span>
            <span style={{ color: "var(--chess-green-light)" }}>♘</span>
            <span style={{ color: "var(--chess-green-dark)" }}>♙</span>
          </motion.div>
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center space-x-3 text-2xl md:text-3xl"
            initial={{ opacity: 0, x: 50 }}
            transition={{ delay: 0.6, duration: 0.6, ease: "easeOut" }}
          >
            <span style={{ color: "var(--chess-green-dark)" }}>♚</span>
            <span style={{ color: "var(--chess-green-light)" }}>♛</span>
            <span style={{ color: "var(--chess-green-dark)" }}>♜</span>
            <span style={{ color: "var(--chess-green-light)" }}>♝</span>
            <span style={{ color: "var(--chess-green-dark)" }}>♞</span>
            <span style={{ color: "var(--chess-green-light)" }}>♟</span>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
