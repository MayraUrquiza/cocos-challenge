import type { Kysely } from 'kysely';
import type { UserFinder } from '../../../../../application/ports/outbound/user-finder';
import type { DB } from '../../../../database/schema';

export class PostgresUserFinder implements UserFinder {
  constructor(private readonly db: Kysely<DB>) {}

  async exists(userId: number): Promise<boolean> {
    const row = await this.db
      .selectFrom('users')
      .select('id')
      .where('id', '=', userId)
      .executeTakeFirst();
    return row !== undefined;
  }
}
