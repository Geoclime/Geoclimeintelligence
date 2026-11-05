import { AppError } from "../../common/errors/app-error";
import { BaseRepository } from "../../common/repository/base.repository";
import type { PageMeta } from "../../common/response/api-response";
import { User } from "./user.entity";
import type { IUserRepository, NewUser, RoleRequestPatch, UserAccessPatch, UserListQuery, UserProfilePatch } from "./user.types";

export class UserRepository extends BaseRepository<User> implements IUserRepository {
  private static _instance?: UserRepository;
  static get Instance(): UserRepository {
    return (this._instance ??= new UserRepository());
  }

  protected readonly entity = User;

  findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    return this.repo.findOneBy({ firebaseUid });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder("u")
      .where("lower(u.email) = lower(:email)", { email })
      .getOne();
  }

  async createIfAbsent(input: NewUser): Promise<User> {
    // A new user's first few requests can arrive in parallel; ON CONFLICT DO NOTHING lets
    // every one of them succeed instead of all but one hitting the unique constraint.
    await this.repo.createQueryBuilder().insert().into(User).values(input).orIgnore().execute();
    const user = await this.findByFirebaseUid(input.firebaseUid);
    if (!user) throw new AppError(500, "User record could not be created");
    return user;
  }

  override async findPage(query: UserListQuery): Promise<{ items: User[]; meta: PageMeta }> {
    const qb = this.repo.createQueryBuilder("u");
    // Open requests are a queue, so they come oldest request first; otherwise oldest account first.
    if (query.pendingRequest) qb.where("u.requested_role IS NOT NULL").orderBy("u.roleRequestedAt", "ASC");
    else qb.orderBy("u.createdAt", "ASC");
    qb.addOrderBy("u.id", "ASC");
    if (query.q) {
      // Escape LIKE wildcards so a search for "a_b" means the text "a_b".
      const pattern = `%${query.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      qb.andWhere("(u.email ILIKE :pattern OR u.display_name ILIKE :pattern OR u.organisation ILIKE :pattern)", { pattern });
    }
    if (query.role) qb.andWhere("u.role = :role", { role: query.role });

    const [items, total] = await qb
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async updateAccess(id: string, patch: UserAccessPatch): Promise<User | null> {
    await this.repo.update({ id }, patch);
    return this.findById(id);
  }

  async updateProfile(id: string, patch: UserProfilePatch): Promise<User | null> {
    if (Object.keys(patch).length > 0) await this.repo.update({ id }, patch);
    return this.findById(id);
  }

  async setRoleRequest(id: string, request: RoleRequestPatch | null): Promise<User | null> {
    await this.repo.update({ id }, request ?? { requestedRole: null, roleRequestReason: null, roleRequestedAt: null });
    return this.findById(id);
  }

  hasAnyAdministrator(): Promise<boolean> {
    return this.repo.existsBy({ role: "administrator" });
  }
}
