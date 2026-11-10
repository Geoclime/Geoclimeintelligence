import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { AppError, ValidationError } from "../../common/errors/app-error";
import { ok } from "../../common/response/api-response";
import { validate } from "../../middleware/validate.middleware";
import { PHOTO_MAX_BYTES } from "../photos/photo.service";
import { HouseholdPhotoService } from "./household-photo.service";

// Mounted at /api/v1/households/:id/photos. Any signed-in user may call these; the service decides who
// sees or changes what: the owner and staff with households.view see photos, only the owner adds one,
// and the owner (or an administrator) removes one. Nothing here is public.

const onePhoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: PHOTO_MAX_BYTES, files: 1, fields: 4 } }).single("file");

function uploadPhoto(req: Request, res: Response, next: NextFunction) {
  onePhoto(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") return next(new AppError(413, `A photo must be ${PHOTO_MAX_BYTES / (1024 * 1024)} MB or smaller`));
      return next(new ValidationError([{ field: err.field ?? "file", message: err.message }]));
    }
    next(err);
  });
}

const householdParams = z.object({ params: z.object({ id: z.uuid("Not a valid id") }) });
const photoParams = z.object({ params: z.object({ id: z.uuid("Not a valid id"), photoId: z.uuid("Not a valid id") }) });

const handle =
  (work: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    work(req, res).catch(next);
  };

export const householdPhotosRouter = Router({ mergeParams: true });

/** GET /: the photos of one household. */
householdPhotosRouter.get(
  "/",
  validate(householdParams),
  handle(async (req, res) => res.json(ok(await HouseholdPhotoService.Instance.list(String(req.params.id), req.user!)))),
);

/** GET /:photoId/file: the photo itself (a redirect to a signed link, or the bytes). */
householdPhotosRouter.get(
  "/:photoId/file",
  validate(photoParams),
  handle(async (req, res) => {
    const file = await HouseholdPhotoService.Instance.file(String(req.params.id), String(req.params.photoId), req.user!);
    if ("redirect" in file) return res.set("Cache-Control", "private, no-store").redirect(302, file.redirect);
    res.set({ "Content-Type": file.mimeType, "Content-Disposition": "inline", "Cache-Control": "private, max-age=3600" });
    return res.send(file.data);
  }),
);

/** POST /: adds one photo (multipart `file`). Owner only. */
householdPhotosRouter.post(
  "/",
  uploadPhoto,
  validate(householdParams),
  handle(async (req, res) => {
    if (!req.file) throw new ValidationError([{ field: "file", message: "Choose a photo to upload" }]);
    return res.status(201).json(ok(await HouseholdPhotoService.Instance.add(String(req.params.id), req.file.buffer, req.user!), "Photo added"));
  }),
);

/** DELETE /:photoId: removes one photo and its file. */
householdPhotosRouter.delete(
  "/:photoId",
  validate(photoParams),
  handle(async (req, res) => {
    await HouseholdPhotoService.Instance.remove(String(req.params.id), String(req.params.photoId), req.user!);
    return res.json(ok(null, "Photo deleted"));
  }),
);
