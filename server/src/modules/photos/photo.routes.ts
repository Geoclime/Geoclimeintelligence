import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { AppError, ValidationError } from "../../common/errors/app-error";
import { ok } from "../../common/response/api-response";
import { requirePermission } from "../../middleware/require-permission.middleware";
import { validate } from "../../middleware/validate.middleware";
import { PHOTO_SUBJECT_TYPES, type PhotoSubjectType } from "./photo.types";
import { PHOTO_MAX_BYTES, PhotoService } from "./photo.service";

// Mounted at /api/v1/photos. Adding needs photos.add; seeing (the list and the files) needs photos.view,
// which is staff-only as seeded; deleting is for whoever added the photo, or photos.delete_any (checked in
// the service). Nothing here is public: photos never go on the alert map.

const onePhoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: PHOTO_MAX_BYTES, files: 1, fields: 10 } }).single("file");

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

const blank = (value: unknown) => (value === "" ? undefined : value);
const optionalNumber = (min: number, max: number) => z.preprocess(blank, z.coerce.number().min(min).max(max).optional());

const subjectQuery = z.object({
  subjectType: z.enum(PHOTO_SUBJECT_TYPES, "Say what the photo is of: flood, drain, inspection or place"),
  subjectId: z.uuid("Not a valid id"),
});

/** A multipart form: `file`, the subject, and what the phone knew when it was taken. */
const addPhotoSchema = z.object({
  body: subjectQuery
    .extend({
      caption: z.preprocess(blank, z.string().trim().max(200, "Keep the caption to 200 characters or fewer").optional()),
      takenAt: z.preprocess(blank, z.iso.datetime({ offset: true, error: "takenAt must be a date and time" }).optional()),
      longitude: optionalNumber(-180, 180),
      latitude: optionalNumber(-90, 90),
      accuracyM: optionalNumber(0, 10_000),
    })
    .refine((body) => (body.longitude === undefined) === (body.latitude === undefined), { path: ["latitude"], message: "Send both longitude and latitude, or neither" }),
});
type AddPhotoBody = z.infer<typeof addPhotoSchema>["body"];

const listPhotosSchema = z.object({ query: subjectQuery });
const photoIdSchema = z.object({ params: z.object({ id: z.uuid("Not a valid id") }) });

const handle =
  (work: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    work(req, res).catch(next);
  };

export const photosRouter = Router();

/** GET /limits: how many photos a thing may have, and how large one may be. */
photosRouter.get("/limits", handle(async (_req, res) => res.json(ok(PhotoService.Instance.limits()))));

/** GET /?subjectType=&subjectId=: the photos of one flood, drain, inspection or place. */
photosRouter.get(
  "/",
  requirePermission("photos.view"),
  validate(listPhotosSchema),
  handle(async (req, res) => {
    const { subjectType, subjectId } = req.query as unknown as { subjectType: PhotoSubjectType; subjectId: string };
    return res.json(ok(await PhotoService.Instance.list({ type: subjectType, id: subjectId })));
  }),
);

/** GET /:id/file: the photo itself (a redirect to a signed link, or the bytes). */
photosRouter.get(
  "/:id/file",
  requirePermission("photos.view"),
  validate(photoIdSchema),
  handle(async (req, res) => {
    const file = await PhotoService.Instance.file(String(req.params.id));
    if ("redirect" in file) return res.set("Cache-Control", "private, no-store").redirect(302, file.redirect);
    res.set({ "Content-Type": file.mimeType, "Content-Disposition": "inline", "Cache-Control": "private, max-age=3600" });
    return res.send(file.data);
  }),
);

/** POST /: adds one photo (multipart `file`). */
photosRouter.post(
  "/",
  requirePermission("photos.add"),
  uploadPhoto,
  validate(addPhotoSchema),
  handle(async (req, res) => {
    if (!req.file) throw new ValidationError([{ field: "file", message: "Choose a photo to upload" }]);
    const body = req.body as AddPhotoBody;
    const photo = await PhotoService.Instance.add(
      {
        subject: { type: body.subjectType, id: body.subjectId },
        data: req.file.buffer,
        caption: body.caption ?? null,
        takenAt: body.takenAt ?? null,
        at: body.longitude !== undefined && body.latitude !== undefined ? { longitude: body.longitude, latitude: body.latitude, accuracyM: body.accuracyM ?? null } : null,
      },
      req.user!,
    );
    return res.status(201).json(ok(photo, "Photo added"));
  }),
);

/** DELETE /:id: removes one photo and its file. */
photosRouter.delete(
  "/:id",
  requirePermission("photos.add", "photos.delete_any"),
  validate(photoIdSchema),
  handle(async (req, res) => {
    await PhotoService.Instance.remove(String(req.params.id), req.user!);
    return res.json(ok(null, "Photo deleted"));
  }),
);
