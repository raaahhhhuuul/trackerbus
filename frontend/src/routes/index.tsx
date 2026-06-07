import { Navigate } from "react-router-dom";
import { getHomeRouteForRole, getSession } from "../lib/auth";

export function LandingRedirect() {
  const session = getSession();
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getHomeRouteForRole(session.role)} replace />;
}
