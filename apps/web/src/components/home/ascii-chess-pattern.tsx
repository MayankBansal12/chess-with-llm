export default function AsciiChessPattern() {
  return (
    <div className="flex flex-col items-center space-y-4 font-mono text-sm">
      <div className="space-y-1 text-center">
        <div className="flex flex-col items-center space-y-2">
          <div
            className="text-center leading-none"
            style={{
              color: "var(--chess-green-accent)",
              textShadow: "0 0 10px var(--chess-green-accent)",
            }}
          >
            <div className="flex flex-col items-center space-y-1">
              <div className="flex items-center space-x-2">
                <span style={{ color: "var(--chess-green-light)" }}>♔</span>
                <span style={{ color: "var(--chess-green-dark)" }}>♕</span>
                <span style={{ color: "var(--chess-green-light)" }}>♖</span>
                <span style={{ color: "var(--chess-green-dark)" }}>♗</span>
                <span style={{ color: "var(--chess-green-light)" }}>♘</span>
                <span style={{ color: "var(--chess-green-dark)" }}>♙</span>
              </div>
              <div className="flex items-center space-x-2">
                <span style={{ color: "var(--chess-green-dark)" }}>♚</span>
                <span style={{ color: "var(--chess-green-light)" }}>♛</span>
                <span style={{ color: "var(--chess-green-dark)" }}>♜</span>
                <span style={{ color: "var(--chess-green-light)" }}>♝</span>
                <span style={{ color: "var(--chess-green-dark)" }}>♞</span>
                <span style={{ color: "var(--chess-green-light)" }}>♟</span>
              </div>
            </div>
          </div>

          <div className="text-xs leading-tight">
            <pre className="overflow-x-auto">
              <code style={{ color: "var(--foreground)" }}>
                {`╔═╤═╤═╤═╤═╤═╤═╤═╗
║♜│♞│♝│♛│♚│♝│♞│♜║
╟─┼─┼─┼─┼─┼─┼─┼─╢
║♟│♟│♟│♟│♟│♟│♟│♟║
╟─┼─┼─┼─┼─┼─┼─┼─╢
║ │ │ │ │ │ │ │ ║
╟─┼─┼─┼─┼─┼─┼─┼─╢
║ │ │ │ │ │ │ │ ║
╟─┼─┼─┼─┼─┼─┼─┼─╢
║ │ │ │ │ │ │ │ ║
╟─┼─┼─┼─┼─┼─┼─┼─╢
║♙│♙│♙│♙│♙│♙│♙│♙║
╟─┼─┼─┼─┼─┼─┼─┼─╢
║♖│♘│♗│♕│♔│♗│♘│♖║
╚═╧═╧═╧═╧═╧═╧═╧═╝`}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
