import { Router } from "express";
import { authorise } from "../../middleware/authorise.middleware";
import { validate } from "../../middleware/validate.middleware";
import { CountryController } from "./country.controller";
import { clearLevelSchema, createCountrySchema, getCountrySchema, updateCountrySchema } from "./country.validation";

// Mounted at /api/v1/countries. authMiddleware already ran once in app.ts (section 11), so
// "everyone" below means any signed-in user.
export const countriesRouter = Router();

countriesRouter.get("/", CountryController.list);
countriesRouter.get("/:code", validate(getCountrySchema), CountryController.get);
countriesRouter.post("/", authorise("administrator"), validate(createCountrySchema), CountryController.create);
countriesRouter.patch("/:code", authorise("administrator"), validate(updateCountrySchema), CountryController.update);
// Deletes every area at one level, bottom-up only; the service answers 409 while the level below has areas.
countriesRouter.delete("/:code/levels/:level/areas", authorise("administrator"), validate(clearLevelSchema), CountryController.clearLevel);
// Only a country with no areas can be deleted; the service answers 409 otherwise.
countriesRouter.delete("/:code", authorise("administrator"), validate(getCountrySchema), CountryController.remove);
