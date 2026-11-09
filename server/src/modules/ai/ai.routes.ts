import { Router } from "express";
import { authorise } from "../../middleware/authorise.middleware";
import { rateLimit } from "../../middleware/rate-limit.middleware";
import { validate } from "../../middleware/validate.middleware";
import { AI_ACCESS } from "./ai-access";
import { AiController } from "./ai.controller";
import { listModelsSchema, providerParamSchema, saveAiCredentialSchema } from "./ai.validation";

export const aiRateLimiter = rateLimit({ windowMs: 15 * 60_000, max: 30 });

export const aiRouter = Router();

aiRouter.get("/status", AiController.status);

// Personal keys (staff & researchers)
aiRouter.get("/credentials", authorise(...AI_ACCESS.ownKeys), AiController.listOwn);
aiRouter.put("/credentials", authorise(...AI_ACCESS.ownKeys), aiRateLimiter, validate(saveAiCredentialSchema), AiController.saveOwn);
aiRouter.post("/credentials/:provider/activate", authorise(...AI_ACCESS.ownKeys), validate(providerParamSchema), AiController.activateOwn);
aiRouter.delete("/credentials/:provider", authorise(...AI_ACCESS.ownKeys), validate(providerParamSchema), AiController.removeOwn);
aiRouter.post("/credentials/:provider/models", authorise(...AI_ACCESS.ownKeys), aiRateLimiter, validate(listModelsSchema), AiController.modelsOwn);

// Platform default keys (administrators only)
aiRouter.get("/platform/credentials", authorise(...AI_ACCESS.platformKeys), AiController.listPlatform);
aiRouter.put("/platform/credentials", authorise(...AI_ACCESS.platformKeys), aiRateLimiter, validate(saveAiCredentialSchema), AiController.savePlatform);
aiRouter.post("/platform/credentials/:provider/activate", authorise(...AI_ACCESS.platformKeys), validate(providerParamSchema), AiController.activatePlatform);
aiRouter.delete("/platform/credentials/:provider", authorise(...AI_ACCESS.platformKeys), validate(providerParamSchema), AiController.removePlatform);
aiRouter.post("/platform/credentials/:provider/models", authorise(...AI_ACCESS.platformKeys), aiRateLimiter, validate(listModelsSchema), AiController.modelsPlatform);
