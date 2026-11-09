import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import { AiCredentialService } from "./ai-credential.service";
import { AiService } from "./ai.service";
import type { ListModelsBody, SaveAiCredentialBody } from "./ai.validation";
import type { AiProviderId } from "./providers/ai-provider";

export class AiController {
  static async status(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await AiService.Instance.status(req.user!)));
    } catch (err) {
      next(err);
    }
  }

  static async listOwn(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await AiCredentialService.Instance.list(req.user!.id)));
    } catch (err) {
      next(err);
    }
  }

  static async saveOwn(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as SaveAiCredentialBody;
      const saved = await AiCredentialService.Instance.save(
        { ...body, userId: req.user!.id, updatedBy: req.user!.id },
        req.user!,
      );
      return res.json(ok(saved, "AI key saved"));
    } catch (err) {
      next(err);
    }
  }

  static async activateOwn(req: Request<{ provider: AiProviderId }>, res: Response, next: NextFunction) {
    try {
      return res.json(
        ok(await AiCredentialService.Instance.activate(req.user!.id, req.params.provider, req.user!), "Active AI provider updated"),
      );
    } catch (err) {
      next(err);
    }
  }

  static async removeOwn(req: Request<{ provider: AiProviderId }>, res: Response, next: NextFunction) {
    try {
      await AiCredentialService.Instance.remove(req.user!.id, req.params.provider, req.user!);
      return res.json(ok(null, "AI key removed"));
    } catch (err) {
      next(err);
    }
  }

  static async modelsOwn(req: Request<{ provider: AiProviderId }>, res: Response, next: NextFunction) {
    try {
      const body = req.body as ListModelsBody;
      return res.json(ok(await AiCredentialService.Instance.models(req.user!.id, req.params.provider, body)));
    } catch (err) {
      next(err);
    }
  }

  static async listPlatform(_req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await AiCredentialService.Instance.list(null)));
    } catch (err) {
      next(err);
    }
  }

  static async savePlatform(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as SaveAiCredentialBody;
      const saved = await AiCredentialService.Instance.save(
        { ...body, userId: null, updatedBy: req.user!.id },
        req.user!,
      );
      return res.json(ok(saved, "Platform AI key saved"));
    } catch (err) {
      next(err);
    }
  }

  static async activatePlatform(req: Request<{ provider: AiProviderId }>, res: Response, next: NextFunction) {
    try {
      return res.json(
        ok(await AiCredentialService.Instance.activate(null, req.params.provider, req.user!), "Active platform AI provider updated"),
      );
    } catch (err) {
      next(err);
    }
  }

  static async removePlatform(req: Request<{ provider: AiProviderId }>, res: Response, next: NextFunction) {
    try {
      await AiCredentialService.Instance.remove(null, req.params.provider, req.user!);
      return res.json(ok(null, "Platform AI key removed"));
    } catch (err) {
      next(err);
    }
  }

  static async modelsPlatform(req: Request<{ provider: AiProviderId }>, res: Response, next: NextFunction) {
    try {
      const body = req.body as ListModelsBody;
      return res.json(ok(await AiCredentialService.Instance.models(null, req.params.provider, body)));
    } catch (err) {
      next(err);
    }
  }
}
