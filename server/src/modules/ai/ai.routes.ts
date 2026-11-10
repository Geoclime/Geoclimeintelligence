import { Router } from "express";
import { authorise } from "../../middleware/authorise.middleware";
import { rateLimit } from "../../middleware/rate-limit.middleware";
import { requirePermission } from "../../middleware/require-permission.middleware";
import { validate } from "../../middleware/validate.middleware";
import { AiController } from "./ai.controller";
import { assistantChatSchema, listModelsSchema, providerParamSchema, saveAiCredentialSchema } from "./ai.validation";

/** For AI drafts and key checks: each one is a slow, paid request. */
export const aiRateLimiter = rateLimit({ windowMs: 15 * 60_000, max: 30 });
/** A conversation is many short questions, so chat gets its own, larger allowance. */
export const aiChatRateLimiter = rateLimit({ windowMs: 15 * 60_000, max: 60 });

// Mounted at /api/v1/ai (docs/ai-assistant.md). Who may use AI is a permission on the Roles screen:
// ai.use for the assistant and AI drafts, ai.own_keys for a personal key. The platform's keys pay
// for everyone else's requests, so they stay with administrators (ADMIN_ONLY_POWERS).
export const aiRouter = Router();

aiRouter.get("/status", AiController.status);

// The in-app assistant
aiRouter.post("/chat", requirePermission("ai.use"), aiChatRateLimiter, validate(assistantChatSchema), AiController.chat);

// Personal keys
aiRouter.get("/credentials", requirePermission("ai.own_keys"), AiController.listOwn);
aiRouter.put("/credentials", requirePermission("ai.own_keys"), aiRateLimiter, validate(saveAiCredentialSchema), AiController.saveOwn);
aiRouter.post("/credentials/:provider/activate", requirePermission("ai.own_keys"), validate(providerParamSchema), AiController.activateOwn);
aiRouter.delete("/credentials/:provider", requirePermission("ai.own_keys"), validate(providerParamSchema), AiController.removeOwn);
aiRouter.post("/credentials/:provider/models", requirePermission("ai.own_keys"), aiRateLimiter, validate(listModelsSchema), AiController.modelsOwn);

// Platform default keys (administrators only)
aiRouter.get("/platform/credentials", authorise("administrator"), AiController.listPlatform);
aiRouter.put("/platform/credentials", authorise("administrator"), aiRateLimiter, validate(saveAiCredentialSchema), AiController.savePlatform);
aiRouter.post("/platform/credentials/:provider/activate", authorise("administrator"), validate(providerParamSchema), AiController.activatePlatform);
aiRouter.delete("/platform/credentials/:provider", authorise("administrator"), validate(providerParamSchema), AiController.removePlatform);
aiRouter.post("/platform/credentials/:provider/models", authorise("administrator"), aiRateLimiter, validate(listModelsSchema), AiController.modelsPlatform);
