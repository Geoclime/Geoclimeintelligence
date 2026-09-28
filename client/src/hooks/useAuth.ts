import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "../contexts/AuthContext";

/** Who is signed in, what they may do, and the sign-in/out actions. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
