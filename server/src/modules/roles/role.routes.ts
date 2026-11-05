import { Router, type NextFunction, type Request, type Response } from "express";
import { ok } from "../../common/response/api-response";
import { authorise } from "../../middleware/authorise.middleware";
import { validate } from "../../middleware/validate.middleware";
import { RoleService } from "./role.service";
import { createRoleSchema, roleCodeSchema, updateRoleSchema, type CreateRoleBody, type UpdateRoleBody } from "./role.validation";

// Mounted at /api/v1/roles. Any signed-in user may list the roles (the app names them, e.g. on a
// profile); only administrators may change them, and that power can't be given to another role.

const handle =
  (work: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    work(req, res).catch(next);
  };

export const rolesRouter = Router();

/** GET /: every role, with its permissions and how many people hold it. */
rolesRouter.get("/", handle(async (_req, res) => res.json(ok(await RoleService.Instance.list()))));

/** GET /permissions: every permission there is, grouped, and the powers only administrators hold. */
rolesRouter.get("/permissions", handle(async (_req, res) => res.json(ok(RoleService.Instance.catalog()))));

rolesRouter.post(
  "/",
  authorise("administrator"),
  validate(createRoleSchema),
  handle(async (req, res) => res.status(201).json(ok(await RoleService.Instance.create(req.body as CreateRoleBody, req.user!), "Role created"))),
);

rolesRouter.patch(
  "/:code",
  authorise("administrator"),
  validate(updateRoleSchema),
  handle(async (req, res) =>
    res.json(ok(await RoleService.Instance.update(String(req.params.code), req.body as UpdateRoleBody, req.user!), "Role updated")),
  ),
);

rolesRouter.delete(
  "/:code",
  authorise("administrator"),
  validate(roleCodeSchema),
  handle(async (req, res) => {
    await RoleService.Instance.remove(String(req.params.code), req.user!);
    return res.json(ok(null, "Role deleted"));
  }),
);
