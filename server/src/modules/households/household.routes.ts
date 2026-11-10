import { Router, type NextFunction, type Request, type Response } from "express";
import { ok } from "../../common/response/api-response";
import { validate } from "../../middleware/validate.middleware";
import { householdPhotosRouter } from "./household-photo.routes";
import { HouseholdService } from "./household.service";
import { createHouseholdSchema, householdGeoJsonSchema, householdIdSchema, householdSearchSchema, updateHouseholdSchema, type CreateHouseholdBody, type UpdateHouseholdBody } from "./household.validation";

// Mounted at /api/v1/households. Any signed-in user may add, change and remove their own households.
// What the map shows is decided in the service: the viewer's own, or everyone's for staff with
// households.view. Nothing here is public.

const handle =
  (work: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    work(req, res).catch(next);
  };

export const householdsRouter = Router();

/** /:id/photos: photos of a home, as private as the household (household-photo.routes.ts). */
householdsRouter.use("/:id/photos", householdPhotosRouter);

/** GET /mine: the signed-in person's households. */
householdsRouter.get("/mine", handle(async (req, res) => res.json(ok(await HouseholdService.Instance.mine(req.user!)))));

/** GET /search?q=: households matching a search that the viewer may see (their own; everyone's for staff). */
householdsRouter.get(
  "/search",
  validate(householdSearchSchema),
  handle(async (req, res) => res.json(ok(await HouseholdService.Instance.search((req.query as unknown as { q: string }).q, req.user!)))),
);

/** GET /geojson?bbox=&within=: the households in view that the viewer may see. */
householdsRouter.get(
  "/geojson",
  validate(householdGeoJsonSchema),
  handle(async (req, res) => {
    const { bbox, within } = req.query as unknown as { bbox: [number, number, number, number]; within?: string };
    return res.json(ok(await HouseholdService.Instance.geoJson(bbox, req.user!, within)));
  }),
);

householdsRouter.post(
  "/",
  validate(createHouseholdSchema),
  handle(async (req, res) => res.status(201).json(ok(await HouseholdService.Instance.create(req.body as CreateHouseholdBody, req.user!), "Household saved"))),
);

householdsRouter.patch(
  "/:id",
  validate(updateHouseholdSchema),
  handle(async (req, res) => res.json(ok(await HouseholdService.Instance.update(String(req.params.id), req.body as UpdateHouseholdBody, req.user!), "Household updated"))),
);

householdsRouter.delete(
  "/:id",
  validate(householdIdSchema),
  handle(async (req, res) => {
    await HouseholdService.Instance.remove(String(req.params.id), req.user!);
    return res.json(ok(null, "Household removed"));
  }),
);
