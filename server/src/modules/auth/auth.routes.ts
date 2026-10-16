import { Router } from "express";
import { validate } from "../../middleware/validate.middleware";
import { AuthController } from "./auth.controller";
import { updateProfileSchema } from "./auth.validation";

// Mounted at /api/v1/auth. Any signed-in role may call these, so there is no authorise()
// here -- authMiddleware in app.ts has already rejected unauthenticated requests.
export const authRouter = Router();

authRouter.get("/me", AuthController.me);
// Each user edits only their own profile details; role and region scope are not accepted here.
authRouter.patch("/me", validate(updateProfileSchema), AuthController.updateProfile);
