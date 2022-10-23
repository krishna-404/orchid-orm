import { db } from '../test-utils/test-db';
import {
  AssertEqual,
  chatData,
  expectSql,
  userData,
  useTestDatabase,
  now,
} from '../test-utils/test-utils';
import { RelationQuery, Sql, TransactionAdapter } from 'pqb';
import { Chat, User } from '../test-utils/test-models';

describe('hasAndBelongsToMany', () => {
  useTestDatabase();

  describe('querying', () => {
    it('should have method to query related data', async () => {
      const chatsQuery = db.chat.all();

      const eq: AssertEqual<
        typeof db.user.chats,
        RelationQuery<'chats', { id: number }, never, typeof chatsQuery, false>
      > = true;

      expect(eq).toBe(true);

      const userId = await db.user.get('id').insert({
        ...userData,
        chats: {
          create: [chatData, chatData],
        },
      });

      const user = await db.user.find(userId);
      const query = db.user.chats(user);

      expectSql(
        query.toSql(),
        `
        SELECT * FROM "chat" AS "chats"
        WHERE EXISTS (
          SELECT 1 FROM "chatUser"
          WHERE "chatUser"."chatId" = "chats"."id"
            AND "chatUser"."userId" = $1
          LIMIT 1
        )
      `,
        [userId],
      );

      const messages = await query;

      expect(messages).toMatchObject([chatData, chatData]);
    });

    it('should have proper joinQuery', () => {
      expectSql(
        db.user.relations.chats
          .joinQuery(db.user.as('u'), db.chat.as('c'))
          .toSql(),
        `
          SELECT * FROM "chat" AS "c"
          WHERE EXISTS (
            SELECT 1 FROM "chatUser"
            WHERE "chatUser"."chatId" = "c"."id"
              AND "chatUser"."userId" = "u"."id"
            LIMIT 1
          )
        `,
      );
    });

    it('should be supported in whereExists', () => {
      expectSql(
        db.user.whereExists('chats').toSql(),
        `
          SELECT * FROM "user"
          WHERE EXISTS (
            SELECT 1 FROM "chat" AS "chats"
            WHERE EXISTS (
              SELECT 1 FROM "chatUser"
              WHERE "chatUser"."chatId" = "chats"."id"
                AND "chatUser"."userId" = "user"."id"
              LIMIT 1
            )
            LIMIT 1
          )
        `,
      );

      expectSql(
        db.user
          .whereExists('chats', (q) => q.where({ 'user.name': 'name' }))
          .toSql(),
        `
        SELECT * FROM "user"
        WHERE EXISTS (
          SELECT 1 FROM "chat" AS "chats"
          WHERE EXISTS (
            SELECT 1 FROM "chatUser"
            WHERE "chatUser"."chatId" = "chats"."id"
              AND "chatUser"."userId" = "user"."id"
            LIMIT 1
          )
            AND "user"."name" = $1
          LIMIT 1
        )
      `,
        ['name'],
      );
    });

    it('should be supported in join', () => {
      const query = db.user
        .join('chats', (q) => q.where({ 'user.name': 'name' }))
        .select('name', 'chats.title');

      const eq: AssertEqual<
        Awaited<typeof query>,
        { name: string; title: string }[]
      > = true;
      expect(eq).toBe(true);

      expectSql(
        query.toSql(),
        `
        SELECT "user"."name", "chats"."title" FROM "user"
        JOIN "chat" AS "chats"
          ON EXISTS (
            SELECT 1 FROM "chatUser"
            WHERE "chatUser"."chatId" = "chats"."id"
              AND "chatUser"."userId" = "user"."id"
            LIMIT 1
          )
          AND "user"."name" = $1
      `,
        ['name'],
      );
    });

    describe('select', () => {
      it('should be selectable', () => {
        const query = db.user.select(
          'id',
          db.user.chats.select('id', 'title').where({ title: 'title' }),
        );

        const eq: AssertEqual<
          Awaited<typeof query>,
          { id: number; chats: { id: number; title: string }[] }[]
        > = true;
        expect(eq).toBe(true);

        expectSql(
          query.toSql(),
          `
            SELECT
              "user"."id",
              (
                SELECT COALESCE(json_agg(row_to_json("t".*)), '[]')
                FROM (
                  SELECT "chats"."id", "chats"."title" FROM "chat" AS "chats"
                  WHERE EXISTS (
                    SELECT 1 FROM "chatUser"
                    WHERE "chatUser"."chatId" = "chats"."id"
                      AND "chatUser"."userId" = "user"."id"
                    LIMIT 1
                  )
                  AND "chats"."title" = $1
                ) AS "t"
              ) AS "chats"
            FROM "user"
          `,
          ['title'],
        );
      });

      it('should be selectable by relation name', () => {
        const query = db.user.select('id', 'chats');

        const eq: AssertEqual<
          Awaited<typeof query>,
          { id: number; chats: Chat[] }[]
        > = true;
        expect(eq).toBe(true);

        expectSql(
          query.toSql(),
          `
            SELECT
              "user"."id",
              (
                SELECT COALESCE(json_agg(row_to_json("t".*)), '[]')
                FROM (
                  SELECT * FROM "chat" AS "chats"
                  WHERE EXISTS (
                    SELECT 1 FROM "chatUser"
                    WHERE "chatUser"."chatId" = "chats"."id"
                      AND "chatUser"."userId" = "user"."id"
                    LIMIT 1
                  )
                ) AS "t"
              ) AS "chats"
            FROM "user"
          `,
        );
      });
    });

    it('should allow to select count', () => {
      const query = db.user.select('id', db.user.chats.count());

      const eq: AssertEqual<
        Awaited<typeof query>,
        { id: number; chats: number }[]
      > = true;
      expect(eq).toBe(true);

      expectSql(
        query.toSql(),
        `
          SELECT
            "user"."id",
            (
              SELECT count(*) FROM "chat" AS "chats"
              WHERE EXISTS (
                SELECT 1 FROM "chatUser"
                WHERE "chatUser"."chatId" = "chats"."id"
                  AND "chatUser"."userId" = "user"."id"
                LIMIT 1
              )
            ) AS "chats"
          FROM "user"
        `,
      );
    });

    it('should allow to select count with alias', () => {
      const query = db.user.select(
        'id',
        db.user.chats.count().as('chatsCount'),
      );

      const eq: AssertEqual<
        Awaited<typeof query>,
        { id: number; chatsCount: number }[]
      > = true;
      expect(eq).toBe(true);

      expectSql(
        query.toSql(),
        `
          SELECT
            "user"."id",
            (
              SELECT count(*) FROM "chat" AS "chats"
              WHERE EXISTS (
                SELECT 1 FROM "chatUser"
                WHERE "chatUser"."chatId" = "chats"."id"
                  AND "chatUser"."userId" = "user"."id"
                LIMIT 1
              )
            ) AS "chatsCount"
          FROM "user"
        `,
      );
    });

    it('should allow to pluck values', () => {
      const query = db.user.select('id', db.user.chats.pluck('title'));

      const eq: AssertEqual<
        Awaited<typeof query>,
        { id: number; chats: string[] }[]
      > = true;
      expect(eq).toBe(true);

      expectSql(
        query.toSql(),
        `
          SELECT
            "user"."id",
            (
              SELECT COALESCE(json_agg("c"), '[]')
              FROM (
                SELECT "chats"."title" AS "c"
                FROM "chat" AS "chats"
                WHERE EXISTS (
                  SELECT 1 FROM "chatUser"
                  WHERE "chatUser"."chatId" = "chats"."id"
                    AND "chatUser"."userId" = "user"."id"
                  LIMIT 1
                )
              ) AS "t"
            ) AS "chats"
          FROM "user"
        `,
      );
    });
  });

  describe('insert', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    const checkUserAndChats = ({
      user,
      chats,
      name,
      title1,
      title2,
    }: {
      user: User;
      chats: Chat[];
      name: string;
      title1: string;
      title2: string;
    }) => {
      expect(user).toEqual({
        ...userData,
        active: null,
        age: null,
        data: null,
        picture: null,
        id: user.id,
        name,
      });

      expect(chats[0]).toEqual({
        ...chatData,
        id: chats[0].id,
        title: title1,
      });

      expect(chats[1]).toEqual({
        ...chatData,
        id: chats[1].id,
        title: title2,
      });
    };

    it('should support create', async () => {
      const query = db.user.select('id').insert({
        ...userData,
        name: 'user 1',
        chats: {
          create: [
            {
              ...chatData,
              title: 'chat 1',
            },
            {
              ...chatData,
              title: 'chat 2',
            },
          ],
        },
      });

      const querySpy = jest.spyOn(TransactionAdapter.prototype, 'query');
      const arraysSpy = jest.spyOn(TransactionAdapter.prototype, 'arrays');

      const user = await query;
      const chatIds = await db.user.chats(user).order('id').pluck('id');

      const [insertUserSql, insertChatsSql] = querySpy.mock.calls.map(
        (item) => item[0],
      );
      const insertChatUserSql = arraysSpy.mock.calls[0][0];

      expectSql(
        insertUserSql as Sql,
        `
        INSERT INTO "user"("name", "password", "updatedAt", "createdAt")
        VALUES ($1, $2, $3, $4)
        RETURNING "user"."id"
      `,
        ['user 1', 'password', now, now],
      );

      expectSql(
        insertChatsSql as Sql,
        `
        INSERT INTO "chat"("title", "updatedAt", "createdAt")
        VALUES ($1, $2, $3), ($4, $5, $6)
        RETURNING "chat"."id"
      `,
        ['chat 1', now, now, 'chat 2', now, now],
      );

      expectSql(
        insertChatUserSql as Sql,
        `
        INSERT INTO "chatUser"("userId", "chatId")
        VALUES ($1, $2), ($3, $4)
      `,
        [user.id, chatIds[0], user.id, chatIds[1]],
      );
    });

    it('should support create many', async () => {
      const query = db.user.select('id').insert([
        {
          ...userData,
          name: 'user 1',
          chats: {
            create: [
              {
                ...chatData,
                title: 'chat 1',
              },
              {
                ...chatData,
                title: 'chat 2',
              },
            ],
          },
        },
        {
          ...userData,
          name: 'user 2',
          chats: {
            create: [
              {
                ...chatData,
                title: 'chat 3',
              },
              {
                ...chatData,
                title: 'chat 4',
              },
            ],
          },
        },
      ]);

      const querySpy = jest.spyOn(TransactionAdapter.prototype, 'query');
      const arraysSpy = jest.spyOn(TransactionAdapter.prototype, 'arrays');

      const users = await query;
      const chatIds = await db.user.join('chats').pluck('chats.id');

      const [insertUserSql, insertChatsSql] = querySpy.mock.calls.map(
        (item) => item[0],
      );
      const insertChatUserSql = arraysSpy.mock.calls[0][0];

      expectSql(
        insertUserSql as Sql,
        `
        INSERT INTO "user"("name", "password", "updatedAt", "createdAt")
        VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)
        RETURNING "user"."id"
      `,
        ['user 1', 'password', now, now, 'user 2', 'password', now, now],
      );

      expectSql(
        insertChatsSql as Sql,
        `
        INSERT INTO "chat"("title", "updatedAt", "createdAt")
        VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9), ($10, $11, $12)
        RETURNING "chat"."id"
      `,
        [
          'chat 1',
          now,
          now,
          'chat 2',
          now,
          now,
          'chat 3',
          now,
          now,
          'chat 4',
          now,
          now,
        ],
      );

      expectSql(
        insertChatUserSql as Sql,
        `
        INSERT INTO "chatUser"("userId", "chatId")
        VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)
      `,
        [
          users[0].id,
          chatIds[0],
          users[0].id,
          chatIds[1],
          users[1].id,
          chatIds[2],
          users[1].id,
          chatIds[3],
        ],
      );
    });

    it('should support connect', async () => {
      await db.chat.insert([
        { ...chatData, title: 'chat 1' },
        { ...chatData, title: 'chat 2' },
      ]);

      const query = db.user.select('id').insert({
        ...userData,
        name: 'user 1',
        chats: {
          connect: [
            {
              title: 'chat 1',
            },
            {
              title: 'chat 2',
            },
          ],
        },
      });

      const querySpy = jest.spyOn(TransactionAdapter.prototype, 'query');
      const arraysSpy = jest.spyOn(TransactionAdapter.prototype, 'arrays');

      const user = await query;
      const chatIds = await db.user.chats(user).order('id').pluck('id');

      const [insertUserSql, ...findChatsSql] = querySpy.mock.calls.map(
        (item) => item[0],
      );
      const insertChatUserSql = arraysSpy.mock.calls[0][0];

      expectSql(
        insertUserSql as Sql,
        `
        INSERT INTO "user"("name", "password", "updatedAt", "createdAt")
        VALUES ($1, $2, $3, $4)
        RETURNING "user"."id"
      `,
        ['user 1', 'password', now, now],
      );

      expect(findChatsSql.length).toBe(2);
      findChatsSql.forEach((sql, i) => {
        expectSql(
          sql as Sql,
          `
            SELECT "chats"."id" FROM "chat" AS "chats"
            WHERE "chats"."title" = $1
            LIMIT $2
          `,
          [`chat ${i + 1}`, 1],
        );
      });

      expectSql(
        insertChatUserSql as Sql,
        `
        INSERT INTO "chatUser"("userId", "chatId")
        VALUES ($1, $2), ($3, $4)
      `,
        [user.id, chatIds[0], user.id, chatIds[1]],
      );
    });

    it('should support connect many', async () => {
      await db.chat.insert([
        { ...chatData, title: 'chat 1' },
        { ...chatData, title: 'chat 2' },
        { ...chatData, title: 'chat 3' },
        { ...chatData, title: 'chat 4' },
      ]);

      const query = db.user.select('id').insert([
        {
          ...userData,
          name: 'user 1',
          chats: {
            connect: [
              {
                title: 'chat 1',
              },
              {
                title: 'chat 2',
              },
            ],
          },
        },
        {
          ...userData,
          name: 'user 2',
          chats: {
            connect: [
              {
                title: 'chat 3',
              },
              {
                title: 'chat 4',
              },
            ],
          },
        },
      ]);

      const querySpy = jest.spyOn(TransactionAdapter.prototype, 'query');
      const arraysSpy = jest.spyOn(TransactionAdapter.prototype, 'arrays');

      const users = await query;
      const chatIds = await db.user.join('chats').pluck('chats.id');

      const [insertUserSql, ...findChatsSql] = querySpy.mock.calls.map(
        (item) => item[0],
      );
      const insertChatUserSql = arraysSpy.mock.calls[0][0];

      expectSql(
        insertUserSql as Sql,
        `
        INSERT INTO "user"("name", "password", "updatedAt", "createdAt")
        VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)
        RETURNING "user"."id"
      `,
        ['user 1', 'password', now, now, 'user 2', 'password', now, now],
      );

      expect(findChatsSql.length).toBe(4);
      findChatsSql.forEach((sql, i) => {
        expectSql(
          sql as Sql,
          `
            SELECT "chats"."id" FROM "chat" AS "chats"
            WHERE "chats"."title" = $1
            LIMIT $2
          `,
          [`chat ${i + 1}`, 1],
        );
      });

      expectSql(
        insertChatUserSql as Sql,
        `
        INSERT INTO "chatUser"("userId", "chatId")
        VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)
      `,
        [
          users[0].id,
          chatIds[0],
          users[0].id,
          chatIds[1],
          users[1].id,
          chatIds[2],
          users[1].id,
          chatIds[3],
        ],
      );
    });

    it('should support connect or create', async () => {
      const chatId = await db.chat.get('id').insert({
        ...chatData,
        title: 'chat 1',
      });

      const query = db.user.create({
        ...userData,
        name: 'user 1',
        chats: {
          connectOrCreate: [
            {
              where: { title: 'chat 1' },
              create: { ...chatData, title: 'chat 1' },
            },
            {
              where: { title: 'chat 2' },
              create: { ...chatData, title: 'chat 2' },
            },
          ],
        },
      });

      const user = await query;
      const chats = await db.user.chats(user).order('title');

      expect(chats[0].id).toBe(chatId);

      checkUserAndChats({
        user,
        chats,
        name: 'user 1',
        title1: 'chat 1',
        title2: 'chat 2',
      });
    });

    it('should support connect or create many', async () => {
      const [{ id: chat1Id }, { id: chat4Id }] = await db.chat
        .select('id')
        .insert([
          {
            ...chatData,
            title: 'chat 1',
          },
          {
            ...chatData,
            title: 'chat 4',
          },
        ]);

      const query = db.user.create([
        {
          ...userData,
          name: 'user 1',
          chats: {
            connectOrCreate: [
              {
                where: { title: 'chat 1' },
                create: { ...chatData, title: 'chat 1' },
              },
              {
                where: { title: 'chat 2' },
                create: { ...chatData, title: 'chat 2' },
              },
            ],
          },
        },
        {
          ...userData,
          name: 'user 2',
          chats: {
            connectOrCreate: [
              {
                where: { title: 'chat 3' },
                create: { ...chatData, title: 'chat 3' },
              },
              {
                where: { title: 'chat 4' },
                create: { ...chatData, title: 'chat 4' },
              },
            ],
          },
        },
      ]);

      const users = await query;
      const chats = await db.chat.order('title');

      expect(chats[0].id).toBe(chat1Id);
      expect(chats[3].id).toBe(chat4Id);

      checkUserAndChats({
        user: users[0],
        chats: chats.slice(0, 2),
        name: 'user 1',
        title1: 'chat 1',
        title2: 'chat 2',
      });

      checkUserAndChats({
        user: users[1],
        chats: chats.slice(2, 4),
        name: 'user 2',
        title1: 'chat 3',
        title2: 'chat 4',
      });
    });
  });

  describe('update', () => {
    describe('disconnect', () => {
      it('should delete join table rows', async () => {
        const userId = await db.user.get('id').insert({
          ...userData,
          name: 'user',
          chats: {
            create: [
              { ...chatData, title: 'chat 1' },
              { ...chatData, title: 'chat 2' },
              { ...chatData, title: 'chat 3' },
            ],
          },
        });

        await db.user.where({ id: userId }).update({
          chats: {
            disconnect: [{ title: 'chat 1' }, { title: 'chat 2' }],
          },
        });

        const chats = await db.user.chats({ id: userId });
        expect(chats.length).toBe(1);
        expect(chats[0].title).toEqual('chat 3');
      });
    });

    describe('set', () => {
      it('should delete previous join records and create join records for matching related records', async () => {
        const id = await db.user.get('id').insert({
          ...userData,
          chats: {
            create: [
              { ...chatData, title: 'chat 1' },
              { ...chatData, title: 'chat 2' },
            ],
          },
        });

        await db.chat.insert({
          ...chatData,
          title: 'chat 3',
        });

        await db.user.where({ id }).update({
          chats: {
            set: [{ title: 'chat 2' }, { title: 'chat 3' }],
          },
        });

        const chats = await db.user
          .chats({ id })
          .select('title')
          .order('title');
        expect(chats).toEqual([{ title: 'chat 2' }, { title: 'chat 3' }]);
      });
    });

    describe('delete', () => {
      it('should delete related records', async () => {
        const id = await db.user.get('id').insert({
          ...userData,
          chats: {
            create: [
              { ...chatData, title: 'chat 1' },
              { ...chatData, title: 'chat 2' },
              { ...chatData, title: 'chat 3' },
            ],
          },
        });

        await db.user.insert({
          ...userData,
          chats: {
            create: [{ ...chatData, title: 'chat 4' }],
          },
        });

        await db.user.find(id).update({
          chats: {
            delete: [{ title: 'chat 1' }, { title: 'chat 2' }],
          },
        });

        expect(await db.chat.count()).toBe(2);

        const chats = await db.user.chats({ id }).select('title');
        expect(chats).toEqual([{ title: 'chat 3' }]);
      });
    });

    describe('nested update', () => {
      it('should update related records', async () => {
        const id = await db.user.get('id').insert({
          ...userData,
          chats: {
            create: [
              { ...chatData, title: 'chat 1' },
              { ...chatData, title: 'chat 2' },
              { ...chatData, title: 'chat 3' },
            ],
          },
        });

        await db.user.insert({
          ...userData,
          chats: {
            create: [{ ...chatData, title: 'chat 4' }],
          },
        });

        await db.user.find(id).update({
          chats: {
            update: {
              where: {
                title: { in: ['chat 2', 'chat 3', 'chat 4'] },
              },
              data: {
                title: 'updated',
              },
            },
          },
        });

        const titles = await db.chat.order('id').pluck('title');
        expect(titles).toEqual(['chat 1', 'updated', 'updated', 'chat 4']);
      });
    });

    describe('nested create', () => {
      it('should create many records and connect all found updating with them', async () => {
        const userIds = await db.user.pluck('id').insert([userData, userData]);

        await db.user.where({ id: { in: userIds } }).update({
          chats: {
            create: [
              {
                ...chatData,
                title: 'created 1',
              },
              {
                ...chatData,
                title: 'created 2',
              },
            ],
          },
        });

        const firstUserChats = await db.user
          .chats({ id: userIds[0] })
          .order('title');
        expect(firstUserChats.map((chat) => chat.title)).toEqual([
          'created 1',
          'created 2',
        ]);

        const secondUserChats = await db.user
          .chats({ id: userIds[1] })
          .order('title');
        expect(secondUserChats.map((chat) => chat.title)).toEqual([
          'created 1',
          'created 2',
        ]);

        expect(firstUserChats.map((chat) => chat.id)).toEqual(
          secondUserChats.map((chat) => chat.id),
        );
      });
    });
  });
});
