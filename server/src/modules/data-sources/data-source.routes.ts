import { Router } from "express";
import { authorise } from "../../middleware/authorise.middleware";
import { validate } from "../../middleware/validate.middleware";
import { DataSourceController } from "./data-source.controller";
import { createDataSourceSchema, deleteDataSourceSchema, listDataSourcesSchema } from "./data-source.validation";

// Mounted at /api/v1/data-sources. authMiddleware already ran once in app.ts (section 11).
// Any signed-in user may read where data came from; only Administrators add or delete sources.
export const dataSourcesRouter = Router();

dataSourcesRouter.get("/", validate(listDataSourcesSchema), DataSourceController.list);
dataSourcesRouter.post("/", authorise("administrator"), validate(createDataSourceSchema), DataSourceController.create);
dataSourcesRouter.delete("/:id", authorise("administrator"), validate(deleteDataSourceSchema), DataSourceController.remove);
