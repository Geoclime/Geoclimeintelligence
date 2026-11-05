import { Router } from "express";
import { validate } from "../../middleware/validate.middleware";
import { NotificationController } from "./notification.controller";
import { listNotificationsSchema, notificationIdSchema, pushTokenSchema, savePreferenceSchema } from "./notification.validation";

// Mounted at /api/v1/notifications. Every route acts on the signed-in person's own notifications,
// settings and devices only; authMiddleware already ran once in app.ts (section 11).
export const notificationsRouter = Router();

// The fixed paths come before "/:id".
notificationsRouter.get("/", validate(listNotificationsSchema), NotificationController.list);
notificationsRouter.get("/unread-count", NotificationController.unreadCount);
notificationsRouter.post("/read-all", NotificationController.markAllRead);
notificationsRouter.get("/preferences", NotificationController.preferences);
notificationsRouter.put("/preferences", validate(savePreferenceSchema), NotificationController.savePreference);
notificationsRouter.post("/push-tokens", validate(pushTokenSchema), NotificationController.addPushToken);
notificationsRouter.delete("/push-tokens", validate(pushTokenSchema), NotificationController.removePushToken);
notificationsRouter.post("/:id/read", validate(notificationIdSchema), NotificationController.markRead);
