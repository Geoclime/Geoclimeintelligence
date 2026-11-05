import { AppDataSource } from "../../config/data-source";
import { logger } from "../../config/logger";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, type Permission } from "./permissions";

/** Where the role-to-permission map comes from: the roles repository in the app. */
export interface PermissionSource {
  loadPermissions(): Promise<Map<string, Permission[]>>;
}

/** How long a loaded map is trusted before it is read again. Edits on this server clear it at once. */
const CACHE_MS = 30_000;

/**
 * Answers "may this person do this?" from their role. Every request asks, so the role-to-permission
 * map is read once and kept for 30 seconds (and dropped at once when a role is edited on this server).
 *
 * Administrators hold every permission without a lookup. If the map can't be read (the database is
 * down, or not open at all, as in unit tests), the built-in roles fall back to what the seed gives
 * them (DEFAULT_ROLE_PERMISSIONS: their access before permissions existed) and any other role holds
 * nothing: an unknown never widens access.
 */
export class PermissionResolver {
  private static _instance?: PermissionResolver;
  static get Instance(): PermissionResolver {
    return (this._instance ??= new PermissionResolver());
  }

  private cache: { map: Map<string, Permission[]>; at: number } | null = null;
  private loading: Promise<Map<string, Permission[]> | null> | null = null;
  private source: PermissionSource | null = null;

  /** Set once at start-up (app.ts), so this file doesn't import the module that edits roles. */
  useSource(source: PermissionSource): void {
    this.source = source;
    this.invalidate();
  }

  /** A role was edited: the next question reads the map again. */
  invalidate(): void {
    this.cache = null;
  }

  async permissionsFor(role: string): Promise<readonly Permission[]> {
    if (role === "administrator") return PERMISSIONS;
    const map = await this.map();
    return map?.get(role) ?? DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  }

  async has(user: { role: string }, permission: Permission): Promise<boolean> {
    if (user.role === "administrator") return true;
    return (await this.permissionsFor(user.role)).includes(permission);
  }

  /** True when the role holds at least one of them. */
  async hasAny(user: { role: string }, permissions: readonly Permission[]): Promise<boolean> {
    if (user.role === "administrator") return true;
    const held = await this.permissionsFor(user.role);
    return permissions.some((permission) => held.includes(permission));
  }

  private async map(): Promise<Map<string, Permission[]> | null> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.map;
    if (!this.source || !AppDataSource.isInitialized) return null;
    this.loading ??= this.source
      .loadPermissions()
      .then((map) => {
        this.cache = { map, at: Date.now() };
        return map;
      })
      .catch((err: unknown) => {
        logger.warn({ err }, "Could not read role permissions; built-in roles fall back to their defaults");
        return null;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }
}
