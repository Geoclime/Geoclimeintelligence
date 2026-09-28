import type {
  EntityTarget,
  FindOptionsOrder,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from "typeorm";
import { AppDataSource } from "../../config/data-source";
import { decodeCursor, encodeCursor, type CursorPageQuery, type OffsetPageQuery } from "../pagination/pagination";
import type { PageMeta } from "../response/api-response";

export interface OffsetPageOptions<T> extends OffsetPageQuery {
  where?: FindOptionsWhere<T>;
  order?: FindOptionsOrder<T>;
}

export interface CursorPageOptions<T extends ObjectLiteral> extends CursorPageQuery {
  /** Indexed column to page by, newest first (e.g. "eventDate"). `id` breaks ties. */
  orderBy: keyof T & string;
  /** Adds the caller's WHERE clauses (filters, region scope) to the `row` alias with andWhere. */
  filter?: (qb: SelectQueryBuilder<T>) => void;
}

/**
 * Every repository extends this. It is the only layer allowed to touch AppDataSource
 * (section 3, section 8).
 */
export abstract class BaseRepository<T extends ObjectLiteral & { id: string }> {
  protected abstract readonly entity: EntityTarget<T>;

  // Resolved lazily: entity metadata only exists after AppDataSource.initialize().
  protected get repo(): Repository<T> {
    return AppDataSource.getRepository(this.entity);
  }

  findById(id: string): Promise<T | null> {
    // TypeORM can't prove `{ id }` matches FindOptionsWhere<T> for a generic T; the
    // `T extends { id: string }` bound above guarantees it does.
    return this.repo.findOneBy({ id } as FindOptionsWhere<T>);
  }

  async findPage(opts: OffsetPageOptions<T>): Promise<{ items: T[]; meta: PageMeta }> {
    const [items, total] = await this.repo.findAndCount({
      where: opts.where,
      order: opts.order,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    });
    return { items, meta: { page: opts.page, pageSize: opts.pageSize, total } };
  }

  /** Keyset pagination: `WHERE (orderBy, id) < (lastValue, lastId) ORDER BY orderBy DESC, id DESC`. */
  async findCursorPage(opts: CursorPageOptions<T>): Promise<{ items: T[]; meta: PageMeta }> {
    const qb = this.repo
      .createQueryBuilder("row")
      .orderBy(`row.${opts.orderBy}`, "DESC")
      .addOrderBy("row.id", "DESC")
      .take(opts.limit + 1);

    opts.filter?.(qb);
    if (opts.cursor) {
      const { value, id } = decodeCursor(opts.cursor);
      qb.andWhere(`(row.${opts.orderBy}, row.id) < (:cursorValue, :cursorId)`, { cursorValue: value, cursorId: id });
    }

    const rows = await qb.getMany();
    const items = rows.slice(0, opts.limit);
    const last = items[items.length - 1];
    const nextCursor =
      rows.length > opts.limit && last ? encodeCursor({ value: toCursorValue(last[opts.orderBy]), id: last.id }) : undefined;

    return { items, meta: nextCursor ? { pageSize: opts.limit, nextCursor } : { pageSize: opts.limit } };
  }
}

function toCursorValue(value: unknown): string | number {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}
