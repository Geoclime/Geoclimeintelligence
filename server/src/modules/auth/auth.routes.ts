import { Router } from "express";
import { AuthController } from "./auth.controller";

// Mounted at /api/v1/auth. Any signed-in role may call these, so there is no authorise()
// here -- authMiddleware in app.ts has already rejected unauthenticated requests.
export const authRouter = Router();

authRouter.get("/me", AuthController.me);
