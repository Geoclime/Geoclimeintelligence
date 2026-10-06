import { Router } from "express";
import { validate } from "../../middleware/validate.middleware";
import { AdminUnitController } from "./admin-unit.controller";
import {
  adminUnitGeoJsonSchema,
  getAdminUnitSchema,
  listAdminUnitsSchema,
  listChildrenSchema,
  locateSchema,
} from "./admin-unit.validation";

// Mounted at /api/v1/admin-units. Every route is open to any signed-in user; authMiddleware
// already ran once in app.ts (section 11). There are no write routes: areas only arrive
// through POST /api/v1/imports/:id/promote.
export const adminUnitsRouter = Router();

// The fixed paths come before "/:id" so "geojson" and "locate" are never read as an id.
adminUnitsRouter.get("/geojson", validate(adminUnitGeoJsonSchema), AdminUnitController.geoJson);
adminUnitsRouter.get("/locate", validate(locateSchema), AdminUnitController.locate);
adminUnitsRouter.get("/", validate(listAdminUnitsSchema), AdminUnitController.list);
adminUnitsRouter.get("/:id", validate(getAdminUnitSchema), AdminUnitController.getById);
adminUnitsRouter.get("/:id/children", validate(listChildrenSchema), AdminUnitController.children);
