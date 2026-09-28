import { Router } from "express";
import { authorise } from "../../middleware/authorise.middleware";
import { validate } from "../../middleware/validate.middleware";
import { UserController } from "./user.controller";
import { getUserSchema, listUsersSchema, updateUserAccessSchema } from "./user.validation";

// Mounted at /api/v1/users. authMiddleware and resolveUserMiddleware already ran once in
// app.ts -- never re-add them here (section 11).
export const usersRouter = Router();

usersRouter.get("/", authorise("administrator"), validate(listUsersSchema), UserController.list);
usersRouter.get("/:id", authorise("administrator"), validate(getUserSchema), UserController.getById);
usersRouter.patch(
  "/:id/access",
  authorise("administrator"),
  validate(updateUserAccessSchema),
  UserController.updateAccess,
);
