import { Model } from '../model';
import {
  addQueryOn,
  BelongsToRelation,
  CreateCtx,
  InsertQueryData,
  isQueryReturnsAll,
  pushQueryValue,
  Query,
  QueryBase,
  UpdateCtx,
  VirtualColumn,
  WhereArg,
  WhereResult,
} from 'pqb';
import { RelationData, RelationThunkBase } from './relations';
import { NestedInsertOneItem, NestedUpdateOneItem } from './utils';

export interface BelongsTo extends RelationThunkBase {
  type: 'belongsTo';
  returns: 'one';
  options: BelongsToRelation['options'];
}

export type BelongsToInfo<
  T extends Model,
  Relation extends BelongsTo,
  FK extends string = Relation['options']['foreignKey'],
> = {
  params: Record<FK, T['columns']['shape'][FK]['type']>;
  populate: never;
  chainedCreate: false;
  chainedDelete: false;
};

type State = {
  query: Query;
  primaryKey: string;
  foreignKey: string;
};

type BelongsToNestedInsert = (
  query: Query,
  relationData: NestedInsertOneItem[],
) => Promise<Record<string, unknown>[]>;

type BelongsToNestedUpdate = (
  q: Query,
  update: Record<string, unknown>,
  params: NestedUpdateOneItem,
  state: {
    updateLater?: Record<string, unknown>;
    updateLaterPromises?: Promise<void>[];
  },
) => boolean;

class BelongsToVirtualColumn extends VirtualColumn {
  private readonly nestedInsert: BelongsToNestedInsert;
  private readonly nestedUpdate: BelongsToNestedUpdate;

  constructor(private key: string, private state: State) {
    super();
    this.nestedInsert = nestedInsert(this.state);
    this.nestedUpdate = nestedUpdate(this.state);
  }

  create(
    q: Query,
    ctx: CreateCtx,
    item: Record<string, unknown>,
    rowIndex: number,
  ) {
    const {
      key,
      state: { foreignKey, primaryKey },
    } = this;

    let columnIndex = ctx.columns.get(foreignKey);
    if (columnIndex === undefined) {
      ctx.columns.set(foreignKey, (columnIndex = ctx.columns.size));
    }

    const store = ctx as unknown as {
      belongsTo?: Record<string, [number, number, unknown][]>;
    };

    if (!store.belongsTo) store.belongsTo = {};

    const values = [rowIndex, columnIndex, item[key]] as [
      number,
      number,
      unknown,
    ];

    if (store.belongsTo[key]) {
      store.belongsTo[key].push(values);
      return;
    }

    const relationData = [values];
    store.belongsTo[key] = relationData;
    q.query.wrapInTransaction = true;

    pushQueryValue(q, 'beforeCreate', async (q: Query) => {
      const inserted = await this.nestedInsert(
        q,
        relationData.map(([, , data]) => data as NestedInsertOneItem),
      );

      const { values } = q.query as InsertQueryData;
      relationData.forEach(([rowIndex, columnIndex], index) => {
        (values as unknown[][])[rowIndex][columnIndex] =
          inserted[index][primaryKey];
      });
    });
  }

  update(q: Query, ctx: UpdateCtx, set: Record<string, unknown>) {
    q.query.wrapInTransaction = true;

    const data = set[this.key] as NestedUpdateOneItem;
    if (this.nestedUpdate(q, set, data, ctx)) {
      ctx.willSetKeys = true;
    }
  }
}

export const makeBelongsToMethod = (
  relation: BelongsTo,
  relationName: string,
  query: Query,
): RelationData => {
  const { primaryKey, foreignKey } = relation.options;
  const state: State = { query, primaryKey, foreignKey };

  return {
    returns: 'one',
    method: (params: Record<string, unknown>) => {
      return query.findBy({ [primaryKey]: params[foreignKey] });
    },
    virtualColumn: new BelongsToVirtualColumn(relationName, state),
    joinQuery(fromQuery, toQuery) {
      return addQueryOn(toQuery, fromQuery, toQuery, primaryKey, foreignKey);
    },
    reverseJoin(fromQuery, toQuery) {
      return addQueryOn(fromQuery, toQuery, fromQuery, foreignKey, primaryKey);
    },
    primaryKey,
  };
};

const nestedInsert = ({ query, primaryKey }: State) => {
  return (async (q, data) => {
    const connectOrCreate = data.filter(
      (
        item,
      ): item is {
        connectOrCreate: {
          where: WhereArg<QueryBase>;
          create: Record<string, unknown>;
        };
      } => Boolean(item.connectOrCreate),
    );

    const t = query.transacting(q);

    let connectOrCreated: unknown[];
    if (connectOrCreate.length) {
      connectOrCreated = await Promise.all(
        connectOrCreate.map((item) =>
          t.findBy(item.connectOrCreate.where)._takeOptional(),
        ),
      );
    } else {
      connectOrCreated = [];
    }

    let connectOrCreatedI = 0;
    const create = data.filter(
      (
        item,
      ): item is
        | {
            create: Record<string, unknown>;
          }
        | {
            connectOrCreate: {
              where: WhereArg<QueryBase>;
              create: Record<string, unknown>;
            };
          } => {
        if (item.connectOrCreate) {
          return !connectOrCreated[connectOrCreatedI++];
        } else {
          return Boolean(item.create);
        }
      },
    );

    let created: unknown[];
    if (create.length) {
      created = (await t
        .select(primaryKey)
        ._createMany(
          create.map((item) =>
            'create' in item ? item.create : item.connectOrCreate.create,
          ),
        )) as unknown[];
    } else {
      created = [];
    }

    const connect = data.filter(
      (
        item,
      ): item is {
        connect: WhereArg<QueryBase>;
      } => Boolean(item.connect),
    );

    let connected: unknown[];
    if (connect.length) {
      connected = await Promise.all(
        connect.map((item) => t.findBy(item.connect)._take()),
      );
    } else {
      connected = [];
    }

    let createdI = 0;
    let connectedI = 0;
    connectOrCreatedI = 0;
    return data.map((item) =>
      item.connectOrCreate
        ? connectOrCreated[connectOrCreatedI++] || created[createdI++]
        : item.connect
        ? connected[connectedI++]
        : created[createdI++],
    ) as Record<string, unknown>[];
  }) as BelongsToNestedInsert;
};

const nestedUpdate = ({ query, primaryKey, foreignKey }: State) => {
  return ((q, update, params, state) => {
    if (params.upsert && isQueryReturnsAll(q)) {
      throw new Error('`upsert` option is not allowed in a batch update');
    }

    let idForDelete: unknown;

    q._beforeUpdate(async (q) => {
      if (params.disconnect) {
        update[foreignKey] = null;
      } else if (params.set) {
        if (primaryKey in params.set) {
          update[foreignKey] =
            params.set[primaryKey as keyof typeof params.set];
        } else {
          update[foreignKey] = await query
            .transacting(q)
            ._findBy(params.set)
            ._get(primaryKey);
        }
      } else if (params.create) {
        update[foreignKey] = await query
          .transacting(q)
          ._get(primaryKey)
          ._create(params.create);
      } else if (params.delete) {
        const selectQuery = q.transacting(q);
        selectQuery.query.type = undefined;
        idForDelete = await selectQuery._getOptional(foreignKey);
        update[foreignKey] = null;
      }
    });

    const { upsert } = params;
    if (upsert || params.update || params.delete) {
      if (
        !q.query.select?.includes('*') &&
        !q.query.select?.includes(foreignKey)
      ) {
        q._select(foreignKey);
      }
    }

    if (upsert) {
      if (!state.updateLater) {
        state.updateLater = {};
        state.updateLaterPromises = [];
      }

      const { handleResult } = q.query;
      q.query.handleResult = async (q, queryResult) => {
        const data = (await handleResult(q, queryResult)) as Record<
          string,
          unknown
        >[];

        const id = data[0][foreignKey];
        if (id !== null) {
          await query
            .transacting(q)
            ._findBy({ [primaryKey]: id })
            ._update<WhereResult<Query>>(upsert.update);
        } else {
          (state.updateLaterPromises as Promise<void>[]).push(
            query
              .transacting(q)
              ._select(primaryKey)
              ._create(upsert.create)
              .then((result) => {
                (state.updateLater as Record<string, unknown>)[foreignKey] = (
                  result as Record<string, unknown>
                )[primaryKey];
              }) as unknown as Promise<void>,
          );
        }

        return data;
      };
    } else if (params.delete || params.update) {
      q._afterQuery(async (q, data) => {
        const id = params.delete
          ? idForDelete
          : Array.isArray(data)
          ? data.length === 0
            ? null
            : {
                in: data
                  .map((item) => item[foreignKey])
                  .filter((id) => id !== null),
              }
          : (data as Record<string, unknown>)[foreignKey];

        if (id !== undefined && id !== null) {
          const t = query.transacting(q)._findBy({
            [primaryKey]: id,
          });

          if (params.delete) {
            await t._delete();
          } else if (params.update) {
            await t._update<WhereResult<Query>>(params.update);
          }
        }
      });
    }

    return !params.update && !params.upsert;
  }) as BelongsToNestedUpdate;
};
