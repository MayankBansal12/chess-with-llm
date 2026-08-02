import { Navigate, Outlet, useParams } from "react-router";

export default function GameIndex() {
  const { gameId } = useParams();
  return gameId ? <Outlet /> : <Navigate replace to="/" />;
}
