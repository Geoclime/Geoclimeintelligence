import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { AppError, ValidationError } from "../../common/errors/app-error";
import { authorise } from "../../middleware/authorise.middleware";
import { validate } from "../../middleware/validate.middleware";
import { FloodReportController } from "./flood-report.controller";
import {
  createReportSchema,
  listReportsSchema,
  myReportsSchema,
  reportIdSchema,
  reportMediaSchema,
  reviewReportSchema,
} from "./flood-report.validation";
import { MAX_UPLOAD_BYTES, MEDIA_LIMITS } from "./media-check";

// Mounted at /api/v1/flood-reports. Any signed-in user may send a report and see their own;
// reviewing is for responders, officials and administrators (region scope checked in the service).

const MAX_FILE_BYTES = MAX_UPLOAD_BYTES;
const KINDS = Object.values(MEDIA_LIMITS);

// Memory storage only, never local disk (section 14): files pass straight on to Cloudinary (or the
// database). Exact per-kind limits, and whether Cloudinary is set up, are checked in the service.
const reportFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: KINDS.reduce((sum, kind) => sum + kind.maxCount, 0), fields: 10 },
}).fields(KINDS.map((kind) => ({ name: kind.field, maxCount: kind.maxCount })));

/** Runs multer, turning its errors into the platform's envelope errors (413 / 400). */
function uploadMedia(req: Request, res: Response, next: NextFunction) {
  reportFiles(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") return next(new AppError(413, `Each file must be ${MAX_FILE_BYTES / (1024 * 1024)} MB or smaller`));
      return next(new ValidationError([{ field: err.field ?? "media", message: err.message }]));
    }
    next(err);
  });
}

export const floodReportsRouter = Router();

// The fixed paths come before "/:id".
floodReportsRouter.post("/", uploadMedia, validate(createReportSchema), FloodReportController.create);
floodReportsRouter.get("/options", FloodReportController.options);
floodReportsRouter.get("/mine", validate(myReportsSchema), FloodReportController.mine);
floodReportsRouter.get("/", authorise("emergency_responder", "government_official"), validate(listReportsSchema), FloodReportController.list);
floodReportsRouter.get("/:id", validate(reportIdSchema), FloodReportController.getById);
floodReportsRouter.get("/:id/media/:mediaId", validate(reportMediaSchema), FloodReportController.media);
floodReportsRouter.post(
  "/:id/review",
  authorise("emergency_responder", "government_official"),
  validate(reviewReportSchema),
  FloodReportController.review,
);
