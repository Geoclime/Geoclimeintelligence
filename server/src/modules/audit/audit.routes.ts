import { Router, type NextFunction, type Request, type Response } from "express";
import { ok } from "../../common/response/api-response";
import { requirePermission } from "../../middleware/require-permission.middleware";
import { validate } from "../../middleware/validate.middleware";
import { AuditService } from "./audit.service";
import { exportAuditSchema, listAuditSchema, type ExportAuditQuery, type ListAuditQuery } from "./audit.validation";

// Mounted at /api/v1/audit-events. Reading the log needs the audit.view permission (administrators
// always have it). There are no write routes: the log is written by the services that make changes.

async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, pageSize, ...query } = req.query as unknown as ListAuditQuery;
    const { items, meta } = await AuditService.Instance.list(query, page, pageSize);
    return res.json(ok(items, "OK", meta));
  } catch (err) {
    next(err);
  }
}

async function exportCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const csv = await AuditService.Instance.exportCsv(req.query as unknown as ExportAuditQuery);
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="geoclime-activity-log-${today}.csv"`);
    // A byte-order mark, so Excel reads names with accents correctly.
    return res.send(`﻿${csv}`);
  } catch (err) {
    next(err);
  }
}

/** GET / (a page of the log, newest first) and GET /export.csv (the whole filtered log). */
export const auditRouter = Router();
auditRouter.get("/", requirePermission("audit.view"), validate(listAuditSchema), list);
auditRouter.get("/export.csv", requirePermission("audit.view"), validate(exportAuditSchema), exportCsv);
