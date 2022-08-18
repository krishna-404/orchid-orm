import {
  AssertEqual,
  expectMatchObjectWithTimestamps,
  expectQueryNotMutated,
  expectSql,
  User,
  useTestDatabase,
} from '../test-utils';
import { raw } from '../common';

describe('update', () => {
  useTestDatabase();

  const now = new Date();
  const data = {
    name: 'name',
    password: 'password',
    createdAt: now,
    updatedAt: now,
  };

  it('should update record with raw sql, returning void', () => {
    const q = User.all();

    const query = q.update(raw('raw sql'));
    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET raw sql
      `,
    );

    const eq: AssertEqual<Awaited<typeof query>, void> = true;
    expect(eq).toBe(true);

    expectQueryNotMutated(q);
  });

  it('should update record, returning void', async () => {
    const q = User.all();

    const { id } = await q.insert(data, ['id']);

    const update = {
      name: 'new name',
      password: 'new password',
    };

    const query = q.where({ id }).update(update);
    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = $1,
            "password" = $2
        WHERE "user"."id" = $3
      `,
      [update.name, update.password, id],
    );

    const result = await query;
    const eq: AssertEqual<typeof result, void> = true;
    expect(eq).toBe(true);

    const updated = await User.takeOrThrow();
    expectMatchObjectWithTimestamps(updated, { ...data, ...update });

    expectQueryNotMutated(q);
  });

  it('should update record, returning columns', async () => {
    const q = User.all();

    const { id } = await q.insert(data, ['id']);

    const update = {
      name: 'new name',
      password: 'new password',
    };

    const query = q.where({ id }).update(update, ['id', 'name']);
    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = $1,
            "password" = $2
        WHERE "user"."id" = $3
        RETURNING "user"."id", "user"."name"
      `,
      [update.name, update.password, id],
    );

    const result = await query;
    const eq: AssertEqual<typeof result, { id: number; name: string }[]> = true;
    expect(eq).toBe(true);

    const updated = await User.takeOrThrow();
    expectMatchObjectWithTimestamps(updated, { ...data, ...update });

    expectQueryNotMutated(q);
  });

  it('should update record, returning all columns', async () => {
    const q = User.all();

    const { id } = await q.insert(data, ['id']);

    const update = {
      name: 'new name',
      password: 'new password',
    };

    const query = q.where({ id }).update(update, '*');
    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = $1,
            "password" = $2
        WHERE "user"."id" = $3
        RETURNING *
      `,
      [update.name, update.password, id],
    );

    const result = await query;
    expectMatchObjectWithTimestamps(result[0], { ...data, ...update });

    const eq: AssertEqual<typeof result, typeof User['type'][]> = true;
    expect(eq).toBe(true);

    const updated = await User.takeOrThrow();
    expectMatchObjectWithTimestamps(updated, { ...data, ...update });

    expectQueryNotMutated(q);
  });

  it('should ignore undefined values, and should not ignore null', () => {
    const q = User.all();

    const query = q.update({
      name: 'new name',
      password: undefined,
      data: null,
    });
    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = $1,
            "data" = $2
      `,
      ['new name', null],
    );

    const eq: AssertEqual<Awaited<typeof query>, void> = true;
    expect(eq).toBe(true);

    expectQueryNotMutated(q);
  });

  it('should support raw sql as a value', () => {
    const q = User.all();

    const query = q.update({
      name: raw('raw sql'),
    });
    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = raw sql
      `,
    );

    const eq: AssertEqual<Awaited<typeof query>, void> = true;
    expect(eq).toBe(true);

    expectQueryNotMutated(q);
  });

  describe('increment', () => {
    it('should increment column by 1', () => {
      const q = User.all();

      const query = q.increment('age');
      expectSql(
        query.toSql(),
        `
          UPDATE "user"
          SET "age" = "age" + $1
        `,
        [1],
      );

      expectQueryNotMutated(q);
    });

    it('should increment column by provided amount', () => {
      const q = User.all();

      const query = q.increment({ age: 3 });
      expectSql(
        query.toSql(),
        `
          UPDATE "user"
          SET "age" = "age" + $1
        `,
        [3],
      );

      expectQueryNotMutated(q);
    });

    it('should support returning', () => {
      const q = User.all();

      const query = q.increment({ age: 3 }, ['id']);
      expectSql(
        query.toSql(),
        `
          UPDATE "user"
          SET "age" = "age" + $1
          RETURNING "user"."id"
        `,
        [3],
      );

      const eq: AssertEqual<Awaited<typeof query>, { id: number }[]> = true;
      expect(eq).toBe(true);

      expectQueryNotMutated(q);
    });
  });

  describe('decrement', () => {
    it('should decrement column by 1', () => {
      const q = User.all();

      const query = q.decrement('age');
      expectSql(
        query.toSql(),
        `
          UPDATE "user"
          SET "age" = "age" - $1
        `,
        [1],
      );

      expectQueryNotMutated(q);
    });

    it('should decrement column by provided amount', () => {
      const q = User.all();

      const query = q.decrement({ age: 3 });
      expectSql(
        query.toSql(),
        `
          UPDATE "user"
          SET "age" = "age" - $1
        `,
        [3],
      );

      expectQueryNotMutated(q);
    });

    it('should support returning', () => {
      const q = User.all();

      const query = q.decrement({ age: 3 }, ['id']);
      expectSql(
        query.toSql(),
        `
          UPDATE "user"
          SET "age" = "age" - $1
          RETURNING "user"."id"
        `,
        [3],
      );

      const eq: AssertEqual<Awaited<typeof query>, { id: number }[]> = true;
      expect(eq).toBe(true);

      expectQueryNotMutated(q);
    });
  });
});
