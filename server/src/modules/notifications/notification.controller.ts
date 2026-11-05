import type { NextFunction, Request, Response } from "express";
import { ok } from "../../common/response/api-response";
import { NotificationService } from "./notification.service";
import type { ListNotificationsQuery, PushTokenBody, SavePreferenceBody } from "./notification.validation";

// Casts of req.query / req.body are safe: validate() already replaced them with the parsed values.

export class NotificationController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { items, unreadCount, meta } = await NotificationService.Instance.list(req.user!, req.query as unknown as ListNotificationsQuery);
      return res.json(ok({ items, unreadCount }, "OK", meta));
    } catch (err) {
      next(err);
    }
  }

  static async unreadCount(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok({ unreadCount: await NotificationService.Instance.unreadCount(req.user!) }));
    } catch (err) {
      next(err);
    }
  }

  static async markRead(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
      return res.json(ok({ unreadCount: await NotificationService.Instance.markRead(req.user!, req.params.id) }));
    } catch (err) {
      next(err);
    }
  }

  static async markAllRead(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok({ unreadCount: await NotificationService.Instance.markAllRead(req.user!) }, "All notifications marked as read"));
    } catch (err) {
      next(err);
    }
  }

  static async preferences(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await NotificationService.Instance.preferences(req.user!)));
    } catch (err) {
      next(err);
    }
  }

  static async savePreference(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(ok(await NotificationService.Instance.savePreference(req.user!, req.body as SavePreferenceBody), "Notification settings saved"));
    } catch (err) {
      next(err);
    }
  }

  static async addPushToken(req: Request, res: Response, next: NextFunction) {
    try {
      const userAgent = req.get("user-agent")?.slice(0, 300) ?? null;
      await NotificationService.Instance.addPushToken(req.user!, (req.body as PushTokenBody).token, userAgent);
      return res.status(201).json(ok(null, "Push notifications are on for this device"));
    } catch (err) {
      next(err);
    }
  }

  static async removePushToken(req: Request, res: Response, next: NextFunction) {
    try {
      await NotificationService.Instance.removePushToken(req.user!, (req.body as PushTokenBody).token);
      return res.json(ok(null, "Push notifications are off for this device"));
    } catch (err) {
      next(err);
    }
  }
}
