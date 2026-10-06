/**
 * ADMINISTRATOR-ONLY bootstrap script: sets a user's role and region scope directly in the
 * database. It exists because every account starts as general_public, so the very first
 * Administrator can't be promoted through the API. After that, use
 * PATCH /api/v1/users/:id/access instead.
 *
 * Needs direct database credentials (DATABASE_URL), which is what restricts it to
 * administrators. Exempt from region checks under AI rule 9 for that reason.
 *
 * Since Phase 2 the first administrator can also come from BOOTSTRAP_ADMIN_EMAIL (see
 * docs/user-management.md); this script remains for recovery and for scoping by hand.
 *
 * Usage (the user must have signed in and called the API once, so their row exists):
 *   npm run user:set-access -- --email someone@example.com --role administrator
 *   npm run user:set-access -- --email responder@example.com --role emergency_responder --scope <admin-unit-uuid>
 */
import "reflect-metadata";
import { parseArgs } from "node:util";
import { z } from "zod";
import { assertScopeAllowedForRole, USER_ROLES } from "../common/access/roles";
import { AppError } from "../common/errors/app-error";
import { AppDataSource } from "../config/data-source";
import { AdminUnitRepository } from "../modules/admin-units/admin-unit.repository";
import { UserRepository } from "../modules/users/user.repository";

const argsSchema = z.object({
  email: z.email(),
  role: z.enum(USER_ROLES),
  scope: z.uuid().optional(),
});

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      role: { type: "string" },
      scope: { type: "string" },
    },
  });
  const args = argsSchema.parse(values);
  const scopeAdminUnitId = args.scope ?? null;
  assertScopeAllowedForRole(args.role, scopeAdminUnitId);

  await AppDataSource.initialize();
  try {
    const user = await UserRepository.Instance.findByEmail(args.email);
    if (!user) {
      throw new AppError(404, `No user with email ${args.email}. They must sign in and call the API once first.`);
    }
    if (scopeAdminUnitId && !(await AdminUnitRepository.Instance.exists(scopeAdminUnitId))) {
      throw new AppError(404, `No admin unit with id ${scopeAdminUnitId}. Find area ids with GET /api/v1/admin-units.`);
    }
    const updated = await UserRepository.Instance.updateAccess(user.id, { role: args.role, scopeAdminUnitId });
    console.log(`Updated ${updated?.email}: role=${updated?.role}, scopeAdminUnitId=${updated?.scopeAdminUnitId ?? "null"}`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  if (err instanceof z.ZodError) {
    console.error(err.issues.map((issue) => `--${issue.path.join(".")}: ${issue.message}`).join("\n"));
  } else if (err instanceof AppError) {
    console.error(err.errors?.map((e) => e.message).join("\n") ?? err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
