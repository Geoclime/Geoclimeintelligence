import { AppError } from "../../common/errors/app-error";
import type { OffsetPageQuery } from "../../common/pagination/pagination";
import { BaseRepository } from "../../common/repository/base.repository";
import type { PageMeta } from "../../common/response/api-response";
import { User } from "./user.entity";
import type { IUserRepository, NewUser, UserAccessPatch } from "./user.types";

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

  override findPage(query: OffsetPageQuery): Promise<{ items: User[]; meta: PageMeta }> {
    return super.findPage({ ...query, order: { createdAt: "ASC", id: "ASC" } });
  }

  async updateAccess(id: string, patch: UserAccessPatch): Promise<User | null> {
    await this.repo.update({ id }, patch);
    return this.findById(id);
  }
}
