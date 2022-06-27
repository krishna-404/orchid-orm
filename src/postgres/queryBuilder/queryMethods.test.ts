import { expectQueryNotMutated, line} from '../test-utils/test-utils';
import { HavingArg } from './toSql';
import { raw } from './common';
import { testDb } from '../test-utils/test-db';

const { adapter, user: User, chat: Chat } = testDb

describe('queryMethods', () => {
  afterAll(() => testDb.destroy())

  describe('.clone', () => {
    it('should return new object with the same data structures', async () => {
      const cloned = User.clone()
      expect(cloned).not.toBe(User)
      expect(cloned.adapter).toBe(adapter)
      expect(cloned.table).toBe(User.table)
      expect(cloned.schema).toBe(User.schema)
    })
  })

  describe('toQuery', () => {
    it('should return the same object if query is present', () => {
      const q = User.clone()
      q.query = {}
      expect(q.toQuery()).toBe(q)
    })

    it('should return new object if it is a User', () => {
      expect(User.toQuery()).not.toBe(User)
    })
  })

  describe('toSql', () => {
    it('generates sql', () => {
      expect(User.toSql()).toBe(`SELECT "user".* FROM "user"`)
    })
  })

  describe('.all', () => {
    it('should return the same query if already all', () => {
      const q = User.all()
      expect(q.all()).toBe(q)
    })

    it('should remove `take` from query if it is set', () => {
      const q = User.take()
      expect(q.query?.take).toBe(true)
      expect(q.all().query?.take).toBe(undefined)
    })

    it('should produce correct sql', () => {
      expect(User.all().toSql()).toBe(`SELECT "user".* FROM "user"`)
    })
  })

  describe('take', () => {
    it('limits to one and returns only one', async () => {
      const q = User.all()
      expect(q.take().toSql()).toContain('LIMIT 1')
      expect(q.toSql()).not.toContain('LIMIT 1')
      const expected = await adapter.query('SELECT * FROM "user" LIMIT 1').then(res => res.rows[0])
      expect(await q.take()).toEqual(expected)
    })
  })

  describe('rows', () => {
    it('returns array of rows', async () => {
      const { rows: expected } = await adapter.arrays('SELECT * FROM "user"')
      const received = await User.rows()
      expect(received).toEqual(expected)
    })

    it('removes `take` from query data', () => {
      expect(User.take().rows().query?.take).toBe(undefined)
    })
  })

  describe('value', () => {
    it('returns a first value', async () => {
      const received = await User.from(raw(`(VALUES ('one')) "user"(a)`)).value()
      expect(received).toBe('one')
    })

    it('removes `take` from query data', () => {
      expect(User.take().value().query?.take).toBe(undefined)
    })
  })

  describe('exec', () => {
    it('returns nothing', async () => {
      const received = await User.exec()
      expect(received).toEqual(undefined)
    })

    it('removes `take` from query data', () => {
      expect(User.take().exec().query?.take).toBe(undefined)
    })
  })

  describe('select', () => {
    it('selects columns', () => {
      const q = User.all()
      expect(q.select('id', 'name').toSql()).toBe(line(`
        SELECT "user"."id", "user"."name" FROM "user"
      `))
      expectQueryNotMutated(q)
    })
  })

  describe('selectAs', () => {
    it('selects columns with aliases', async () => {
      const q = User.all()
      expect(q.selectAs({ aliasedId: 'id', aliasedName: 'name' }).toSql()).toBe(line(`
        SELECT "user"."id" AS "aliasedId", "user"."name" AS "aliasedName"
        FROM "user"
      `))
      expectQueryNotMutated(q)
    })

    it('can select raw', () => {
      const q = User.all()
      expect(q.selectAs({ one: raw('1') }).toSql()).toBe(line(`
        SELECT 1 AS "one" FROM "user"
      `))
      expectQueryNotMutated(q)
    })

    it('can select subquery', () => {
      const q = User.all()
      expect(q.selectAs({ subquery: User.all() }).toSql()).toBe(line(`
        SELECT
          (
            SELECT COALESCE(json_agg(row_to_json("t".*)), '[]') AS "json"
            FROM (SELECT "user".* FROM "user") AS "t"
          ) AS "subquery"
        FROM "user"
      `))
      expectQueryNotMutated(q)
    })
  })

  describe('distinct', () => {
    it('add distinct without specifying columns', () => {
      const q = User.all()
      expect(q.distinct().toSql()).toBe(
        'SELECT DISTINCT "user".* FROM "user"'
      )
      expectQueryNotMutated(q)
    })

    it('add distinct on columns', () => {
      const q = User.all()
      expect(q.distinct('id', 'name').toSql()).toBe(line(`
        SELECT DISTINCT ON ("user"."id", "user"."name") "user".*
        FROM "user"
      `))
      expectQueryNotMutated(q)
    })

    it('add distinct on raw sql', () => {
      const q = User.all()
      expect(q.distinct(raw('"user".id')).toSql()).toBe(line(`
        SELECT DISTINCT ON ("user".id) "user".* FROM "user"
      `))
      expectQueryNotMutated(q)
    })
  })

  describe('and', () => {
    let [where, _where] = [User.where, User._where]
    beforeEach(() => {
      User.where = jest.fn()
      User._where = jest.fn()
    })
    afterAll(() => {
      User.where = where
      User._where = _where
    })

    it('is alias for where', () => {
      User.and({})
      expect(User.where).toBeCalled()
    })

    it('has modifier', () => {
      User._and({})
      expect(User._where).toBeCalled()
    })
  })

  describe('where', () => {
    it('specifies where conditions', () => {
      const q = User.all()
      expect(q.where({ picture: null }).toSql()).toBe(line(`
        SELECT "user".* FROM "user" WHERE "user"."picture" IS NULL
      `))
      expect(q.where({ id: 1 }).toSql()).toBe(line(`
        SELECT "user".* FROM "user" WHERE "user"."id" = 1
      `))
      // TODO: condition for related table
      // expect(q.where({ a: { b: 1 }}).toSql()).toBe(line(`
      //   SELECT "user".* FROM "user" WHERE "a"."b" = 1
      // `))
      expect(q.where({ id: 1 }, q.where({ id: 2 }).or({ id: 3, name: 'n' })).toSql()).toBe(line(`
        SELECT "user".* FROM "user"
        WHERE "user"."id" = 1 AND (
          "user"."id" = 2 OR "user"."id" = 3 AND "user"."name" = 'n'
        )
      `))
      expectQueryNotMutated(q)
    })

    it('should accept raw sql', () => {
      const q = User.all()
      expect(q.where({ id: raw('1 + 2') }).toSql()).toBe(line(`
        SELECT "user".* FROM "user" WHERE "user"."id" = 1 + 2
      `))
      expectQueryNotMutated(q)
    })
  })

  describe('or', () => {
    it('joins conditions with or', () => {
      const q = User.all()
      expect(q.or({ id: 1 }, { name: 'ko' }).toSql()).toBe(line(`
        SELECT "user".* FROM "user"
        WHERE "user"."id" = 1 OR "user"."name" = 'ko'
      `))
      expect(q.or({ id: 1 }, User.where({ id: 2 }).and({ name: 'n' })).toSql()).toBe(line(`
        SELECT "user".* FROM "user"
        WHERE "user"."id" = 1 OR ("user"."id" = 2 AND "user"."name" = 'n')
      `))
      expectQueryNotMutated(q)
    })

    it('should accept raw sql', () => {
      const q = User.all()
      expect(q.or({ id: raw('1 + 2') }, { name: raw('2 + 3') }).toSql()).toBe(line(`
        SELECT "user".* FROM "user"
        WHERE "user"."id" = 1 + 2 OR "user"."name" = 2 + 3
      `))
      expectQueryNotMutated(q)
    })
  })

  describe('find', () => {
    it('searches one by primary key', () => {
      const q = User.all()
      expect(q.find(1).toSql()).toBe(line(`
          SELECT "user".* FROM "user"
          WHERE "user"."id" = 1
          LIMIT 1
      `))
      expectQueryNotMutated(q)
    })

    it('should accept raw sql', () => {
      const q = User.all()
      expect(q.find(raw('1 + 2')).toSql()).toBe(line(`
        SELECT "user".* FROM "user"
        WHERE "user"."id" = 1 + 2
        LIMIT 1
      `))
      expectQueryNotMutated(q)
    })
  })

  describe('findBy', () => {
    it('like where but with take', () => {
      const q = User.all()
      expect(q.findBy({ name: 's' }).toSql()).toBe(
        `SELECT "user".* FROM "user" WHERE "user"."name" = 's' LIMIT 1`
      )
      expectQueryNotMutated(q)
    })

    it('should accept raw', () => {
      const q = User.all()
      expect(q.findBy({ name: raw(`'string'`) }).toSql()).toBe(
        `SELECT "user".* FROM "user" WHERE "user"."name" = 'string' LIMIT 1`
      )
      expectQueryNotMutated(q)
    })
  })

  describe('as', () => {
    it('sets table alias', () => {
      const q = User.all()
      expect(q.select('id').as('as').toSql()).toBe(
        'SELECT "as"."id" FROM "user" AS "as"'
      )
      expectQueryNotMutated(q)
    })
  })

  describe('from', () => {
    it('changes from', () => {
      const q = User.all()
      expect(q.as('t').from('profile').toSql()).toBe(line(`
        SELECT "t".* FROM "profile" AS "t"
      `))
      expectQueryNotMutated(q)
    })

    it('should accept raw', () => {
      const q = User.all()
      expect(q.as('t').from(raw('profile')).toSql()).toBe(line(`
        SELECT "t".* FROM profile AS "t"
      `))
      expectQueryNotMutated(q)
    })
  })

  describe('wrap', () => {
    it('wraps query with another', () => {
      const q = User.all()
      expect(q.select('name').wrap(User.select('name')).toSql()).toBe(
        'SELECT "t"."name" FROM (SELECT "user"."name" FROM "user") AS "t"'
      )
      expectQueryNotMutated(q)
    })

    it('accept `as` parameter', () => {
      const q = User.all()
      expect(q.select('name').wrap(User.select('name'), 'wrapped').toSql()).toBe(
        'SELECT "wrapped"."name" FROM (SELECT "user"."name" FROM "user") AS "wrapped"'
      )
      expectQueryNotMutated(q)
    })
  })

  describe('json', () => {
    it('wraps a query with json functions', () => {
      const q = User.all()
      expect(q.json().toSql()).toBe(line(`
        SELECT COALESCE(json_agg(row_to_json("t".*)), '[]') AS "json"
        FROM (
          SELECT "user".* FROM "user"
        ) AS "t"
      `))
      expectQueryNotMutated(q)
    })

    it('supports `take`', () => {
      const q = User.all()
      expect(q.take().json().toSql()).toBe(line(`
        SELECT COALESCE(row_to_json("t".*), '{}') AS "json"
        FROM (
          SELECT "user".* FROM "user" LIMIT 1
        ) AS "t"
      `))
      expectQueryNotMutated(q)
    })
  })

  describe('group', () => {
    it('groups by columns', () => {
      const q = User.all()
      expect(q.group('id', 'name').toSql()).toBe(line(`
        SELECT "user".* FROM "user"
        GROUP BY "user"."id", "user"."name"
      `))
      expectQueryNotMutated(q)
    })

    it('groups by raw sql', () => {
      const q = User.all()
      const expectedSql = line(`
        SELECT "user".* FROM "user"
        GROUP BY id, name
      `)
      expect(q.group(raw('id'), raw('name')).toSql()).toBe(expectedSql)
      expectQueryNotMutated(q)

      q._group(raw('id'), raw('name'))
      expect(q.toSql()).toBe(expectedSql)
    })
  })
})

describe('having', () => {
  it('adds having conditions from nested structure argument', () => {
    const q = User.all()

    // TODO: improve order and filter for TS
    const arg: HavingArg<typeof User> = {
      sum: {
        id: {
          gt: 5,
          lt: 20,
          distinct: true,
          orderBy: 'name ASC',
          filter: 'id < 20',
          withinGroup: true
        }
      },
      count: {
        id: 5
      }
    }

    const expectedSql = `
      SELECT "user".*
      FROM "user"
      HAVING sum("user"."id")
          WITHIN GROUP (ORDER BY name ASC)
          FILTER (WHERE id < 20) > 5
        AND sum("user"."id")
          WITHIN GROUP (ORDER BY name ASC)
          FILTER (WHERE id < 20) < 20
        AND count("user"."id") = 5
    `

    expect(q.having(arg).toSql()).toBe(line(expectedSql))
    expectQueryNotMutated(q)

    q._having(arg)
    expect(q.toSql()).toBe(line(expectedSql))
  })

  it('adds having condition with raw sql', () => {
    const q = User.all()

    const expectedSql = `
      SELECT "user".*
      FROM "user"
      HAVING count(*) = 1 AND sum(id) = 2
    `

    expect(q.having(raw('count(*) = 1'), raw('sum(id) = 2')).toSql()).toBe(line(expectedSql))
    expectQueryNotMutated(q)

    q._having(raw('count(*) = 1'), raw('sum(id) = 2'))
    expect(q.toSql()).toBe(line(expectedSql))
  })
})

describe('window', () => {
  it('add window which can be used in `over`', () => {
    const q = User.all()

    expect(
      q.window({
        w: {
          partitionBy: 'id',
          orderBy: {
            id: 'DESC'
          }
        }
      }).selectAvg('id', {
        over: 'w'
      }).toSql()
    ).toBe(line(`
      SELECT avg("user"."id") OVER "w" FROM "user"
      WINDOW "w" AS (PARTITION BY "user"."id" ORDER BY "user"."id" DESC)
    `))
    expectQueryNotMutated(q)
  })

  it('adds window with raw sql', () => {
    const q = User.all()

    const windowSql = 'PARTITION BY id ORDER BY name DESC'
    expect(
      q.window({ w: raw(windowSql) })
        .selectAvg('id', {
          over: 'w'
        }).toSql()
    ).toBe(line(`
      SELECT avg("user"."id") OVER "w" FROM "user"
      WINDOW "w" AS (PARTITION BY id ORDER BY name DESC)
    `))
    expectQueryNotMutated(q)
  })
});

['union', 'intersect', 'except'].forEach(what => {
  const upper = what.toUpperCase()
  describe(what, () => {
    it(`adds ${what}`, () => {
      const q = User.all() as any
      let query = q.select('id')
      query = query[what](Chat.select('id'), raw('SELECT 1'))
      query = query[what + 'All'](raw('SELECT 2'))
      query = query.wrap(User.select('id'))

      expect(query.toSql()).toBe(line(`
        SELECT "t"."id" FROM (
          SELECT "user"."id" FROM "user"
          ${upper}
          SELECT "chat"."id" FROM "chat"
          ${upper}
          SELECT 1
          ${upper} ALL
          SELECT 2
        ) AS "t"
      `))

      expectQueryNotMutated(q)
    })

    it('has modifier', () => {
      const q = User.select('id') as any
      q[`_${what}`](raw('SELECT 1'))
      expect(q.toSql()).toBe(line(`
        SELECT "user"."id" FROM "user"
        ${upper}
        SELECT 1
      `))
      q[`_${what}All`](raw('SELECT 2'))
      expect(q.toSql()).toBe(line(`
        SELECT "user"."id" FROM "user"
        ${upper}
        SELECT 1
        ${upper} ALL
        SELECT 2
      `))
    })
  })
})

// describe('order', () => {
//   it(`defines order`, () => {
//     const q = User.all()
//     expect(
//       await q.order('id', {name: 'desc', something: 'asc nulls first'}, {a: {b: 'asc'}}).toSql()
//     ).toBe(line(`
//       SELECT "user".* FROM "user"
//       ORDER BY
//         "user"."id",
//         "user"."name" desc,
//         "user"."something" asc nulls first,
//         "a"."b" asc
//     `))
//     expect(await q.orderRaw('raw').toSql()).toBe(line(`
//       SELECT "user".* FROM "user"
//       ORDER BY raw
//     `))
//     expect(await q.toSql()).toBe('SELECT "user".* FROM "user"')
//   })
//
//   it('has modifier', () => {
//     const q = User.all()
//     q._order('id')
//     expect(await q.toSql()).toBe('SELECT "user".* FROM "user" ORDER BY "user"."id"')
//   })
// })
//
// describe('limit', () => {
//   it('sets limit', () => {
//     const q = User.all()
//     expect(await q.limit(5).toSql()).toBe('SELECT "user".* FROM "user" LIMIT 5')
//     expect(await q.toSql()).toBe('SELECT "user".* FROM "user"')
//   })
//
//   it('has modifier', () => {
//     const q = User.all()
//     q._limit(5)
//     expect(await q.toSql()).toBe('SELECT "user".* FROM "user" LIMIT 5')
//   })
// })
//
// describe('offset', () => {
//   it('sets offset', () => {
//     const q = User.all()
//     expect(await q.offset(5).toSql()).toBe('SELECT "user".* FROM "user" OFFSET 5')
//     expect(await q.toSql()).toBe('SELECT "user".* FROM "user"')
//   })
//
//   it('has modifier', () => {
//     const q = User.all()
//     q._offset(5)
//     expect(await q.toSql()).toBe('SELECT "user".* FROM "user" OFFSET 5')
//   })
// })
//
// describe('for', () => {
//   it('sets for', () => {
//     const q = User.all()
//     expect(await q.for('some sql').toSql()).toBe('SELECT "user".* FROM "user" FOR some sql')
//     expect(await q.toSql()).toBe('SELECT "user".* FROM "user"')
//   })
//
//   it('has modifier', () => {
//     const q = User.all()
//     q._for('some sql')
//     expect(await q.toSql()).toBe('SELECT "user".* FROM "user" FOR some sql')
//   })
// })
//
// describe('join', () => {
//   it('sets join', () => {
//     const q = User.all()
//     expect(await q.join('table', 'as', 'on').toSql()).toBe(line(`
//       SELECT "user".* FROM "user"
//       JOIN "table" AS "as" ON on
//     `))
//     expect(await q.join(Message.where('a').or('b').as('as')).toSql()).toBe(line(`
//       SELECT "user".* FROM "user"
//       JOIN "messages" AS "as" ON a OR b
//     `))
//     expect(await q.toSql()).toBe('SELECT "user".* FROM "user"')
//   })
//
//   it('has modifier', () => {
//     const q = User.all()
//     q._join('table', 'as', 'on')
//     expect(await q.toSql()).toBe(line(`
//       SELECT "user".* FROM "user"
//       JOIN "table" AS "as" ON on
//     `))
//   })
// })
//
// describe('exists', () => {
//   it('selects 1', () => {
//     const q = User.all()
//     expect(await q.exists().toSql()).toBe('SELECT 1 FROM "user"')
//     expect(await q.toSql()).toBe('SELECT "user".* FROM "user"')
//   })
//
//   it('has modifier', () => {
//     const q = User.all()
//     q._exists()
//     expect(await q.toSql()).toBe('SELECT 1 FROM "user"')
//   })
// })
//
// describe('model with hidden column', () => {
//   it('selects by default all columns except hidden', () => {
//     class ModelInterface {
//       id: number
//       name: string
//
//       @porm.hidden
//       password: string
//     }
//
//     const Model = model('table', ModelInterface)
//
//     Model.columnNames = jest.fn(() => ['id', 'name', 'password']) as any
//
//     const q = Model.all()
//     expect(await q.toSql()).toBe('SELECT "table"."id", "table"."name" FROM "table"')
//   })
// })
