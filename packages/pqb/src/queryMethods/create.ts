import {
  defaultsKey,
  Query,
  QueryReturnsAll,
  QueryReturnType,
  queryTypeWithLimitOne,
  SetQueryReturnsAll,
  SetQueryReturnsOne,
} from '../query';
import { pushQueryArray } from '../queryDataUtils';
import { RawExpression } from '../common';
import {
  BelongsToNestedInsert,
  BelongsToRelation,
  HasAndBelongsToManyRelation,
  HasManyRelation,
  HasOneNestedInsert,
  HasOneRelation,
  NestedInsertItem,
  NestedInsertOneItem,
  Relation,
  RelationsBase,
} from '../relations';
import { EmptyObject, SetOptional } from '../utils';
import { InsertQueryData, OnConflictItem, OnConflictMergeUpdate } from '../sql';
import { WhereArg } from './where';
import { parseResult, queryMethodByReturnType } from './then';

export type CreateData<
  T extends Query,
  DefaultKeys extends PropertyKey = keyof T[defaultsKey],
  Data = SetOptional<T['inputType'], DefaultKeys>,
> = [keyof T['relations']] extends [never]
  ? Data
  : OmitBelongsToForeignKeys<T['relations'], Data> & CreateRelationData<T>;

type OmitBelongsToForeignKeys<R extends RelationsBase, Data> = Omit<
  Data,
  {
    [K in keyof R]: R[K] extends BelongsToRelation
      ? R[K]['options']['foreignKey']
      : never;
  }[keyof R]
>;

type CreateRelationData<T extends Query> = {
  [K in keyof T['relations']]: T['relations'][K] extends BelongsToRelation
    ? CreateBelongsToData<T, K, T['relations'][K]>
    : T['relations'][K] extends HasOneRelation
    ? CreateHasOneData<T, K, T['relations'][K]>
    : T['relations'][K] extends HasManyRelation | HasAndBelongsToManyRelation
    ? CreateHasManyData<T, K, T['relations'][K]>
    : EmptyObject;
}[keyof T['relations']];

type CreateBelongsToData<
  T extends Query,
  Key extends keyof T['relations'],
  Rel extends BelongsToRelation,
> =
  | SetOptional<
      {
        [K in Rel['options']['foreignKey']]: Rel['options']['foreignKey'] extends keyof T['inputType']
          ? T['inputType'][Rel['options']['foreignKey']]
          : never;
      },
      keyof T[defaultsKey]
    >
  | {
      [K in Key]:
        | {
            create: CreateData<Rel['nestedCreateQuery']>;
            connect?: never;
            connectOrCreate?: never;
          }
        | {
            create?: never;
            connect: WhereArg<Rel['model']>;
            connectOrCreate?: never;
          }
        | {
            create?: never;
            connect?: never;
            connectOrCreate: {
              where: WhereArg<Rel['model']>;
              create: CreateData<Rel['nestedCreateQuery']>;
            };
          };
    };

type CreateHasOneData<
  T extends Query,
  Key extends keyof T['relations'],
  Rel extends HasOneRelation,
> = 'through' extends Rel['options']
  ? // eslint-disable-next-line @typescript-eslint/ban-types
    {}
  : {
      [K in Key]?:
        | {
            create: CreateData<Rel['nestedCreateQuery']>;
            connect?: never;
            connectOrCreate?: never;
          }
        | {
            create?: never;
            connect: WhereArg<Rel['model']>;
            connectOrCreate?: never;
          }
        | {
            create?: never;
            connect?: never;
            connectOrCreate: {
              where?: WhereArg<Rel['model']>;
              create?: CreateData<Rel['nestedCreateQuery']>;
            };
          };
    };

type CreateHasManyData<
  T extends Query,
  Key extends keyof T['relations'],
  Rel extends HasManyRelation | HasAndBelongsToManyRelation,
> = 'through' extends Rel['options']
  ? // eslint-disable-next-line @typescript-eslint/ban-types
    {}
  : {
      [K in Key]?: {
        create?: CreateData<Rel['nestedCreateQuery']>[];
        connect?: WhereArg<Rel['model']>[];
        connectOrCreate?: {
          where: WhereArg<Rel['model']>;
          create: CreateData<Rel['nestedCreateQuery']>;
        }[];
      };
    };

type CreateResult<T extends Query> = T extends { isCount: true }
  ? T
  : QueryReturnsAll<T['returnType']> extends true
  ? SetQueryReturnsOne<T>
  : T;

type CreateManyResult<T extends Query> = T extends { isCount: true }
  ? T
  : T['returnType'] extends 'one' | 'oneOrThrow'
  ? SetQueryReturnsAll<T>
  : T;

type CreateRawData = { columns: string[]; values: RawExpression };

type OnConflictArg<T extends Query> =
  | keyof T['shape']
  | (keyof T['shape'])[]
  | RawExpression;

type PrependRelations = Record<
  string,
  [rowIndex: number, columnIndex: number, data: Record<string, unknown>][]
>;

type AppendRelations = Record<
  string,
  [rowIndex: number, data: NestedInsertItem][]
>;

type CreateCtx = {
  prependRelations: PrependRelations;
  appendRelations: AppendRelations;
  requiredReturning: Record<string, boolean>;
  relations: Record<string, Relation>;
};

const handleSelect = (q: Query) => {
  const select = q.query.select?.[0];
  const isCount =
    typeof select === 'object' &&
    'function' in select &&
    select.function === 'count';

  if (isCount) {
    q.query.select = undefined;
  } else if (isCount || !q.query.select) {
    q.query.select = ['*'];
  }
};

const processCreateItem = (
  item: Record<string, unknown>,
  rowIndex: number,
  ctx: CreateCtx,
  columns: string[],
  columnsMap: Record<string, number>,
) => {
  Object.keys(item).forEach((key) => {
    if (ctx.relations[key]) {
      if (ctx.relations[key].type === 'belongsTo') {
        const foreignKey = (ctx.relations[key] as BelongsToRelation).options
          .foreignKey;

        let columnIndex = columnsMap[foreignKey];
        if (columnIndex === undefined) {
          columnsMap[foreignKey] = columnIndex = columns.length;
          columns.push(foreignKey);
        }

        if (!ctx.prependRelations[key]) ctx.prependRelations[key] = [];

        ctx.prependRelations[key].push([
          rowIndex,
          columnIndex,
          item[key] as Record<string, unknown>,
        ]);
      } else {
        ctx.requiredReturning[ctx.relations[key].primaryKey] = true;

        if (!ctx.appendRelations[key]) ctx.appendRelations[key] = [];

        ctx.appendRelations[key].push([
          rowIndex,
          item[key] as NestedInsertItem,
        ]);
      }
    } else if (columnsMap[key] === undefined) {
      columnsMap[key] = columns.length;
      columns.push(key);
    }
  });
};

const createCtx = (q: Query): CreateCtx => ({
  prependRelations: {},
  appendRelations: {},
  requiredReturning: {},
  relations: (q as unknown as Query).relations,
});

const getSingleReturnType = (q: Query) => {
  const { select, returnType = 'all' } = q.query;
  if (select) {
    return returnType === 'all' ? 'one' : returnType;
  } else {
    return 'rowCount';
  }
};

const getManyReturnType = (q: Query) => {
  const { select, returnType } = q.query;
  if (select) {
    return returnType === 'one' || returnType === 'oneOrThrow'
      ? 'all'
      : returnType;
  } else {
    return 'rowCount';
  }
};

const handleOneData = (q: Query, data: CreateData<Query>, ctx: CreateCtx) => {
  const columns: string[] = [];
  const columnsMap: Record<string, number> = {};
  const defaults = q.query.defaults;

  if (defaults) {
    data = { ...defaults, ...data };
  }

  processCreateItem(data, 0, ctx, columns, columnsMap);

  const values = [columns.map((key) => (data as Record<string, unknown>)[key])];

  return { columns, values };
};

const handleManyData = (
  q: Query,
  data: CreateData<Query>[],
  ctx: CreateCtx,
) => {
  const columns: string[] = [];
  const columnsMap: Record<string, number> = {};
  const defaults = q.query.defaults;

  if (defaults) {
    data = data.map((item) => ({ ...defaults, ...item }));
  }

  data.forEach((item, i) => {
    processCreateItem(item, i, ctx, columns, columnsMap);
  });

  const values = Array(data.length);

  data.forEach((item, i) => {
    (values as unknown[][])[i] = columns.map((key) => item[key]);
  });

  return { columns, values };
};

const insert = (
  self: Query,
  {
    columns,
    values,
  }: {
    columns: string[];
    values: unknown[][] | RawExpression;
  },
  returnType: QueryReturnType,
  ctx?: CreateCtx,
  fromQuery?: Query,
) => {
  const q = self as Query & { query: InsertQueryData };
  const returning = q.query.select;

  delete q.query.and;
  delete q.query.or;

  q.query.type = 'insert';
  q.query.columns = columns;
  q.query.values = values;
  q.query.fromQuery = fromQuery;

  if (!ctx) {
    q.query.returnType = returnType;
    return q;
  }

  const prependRelationsKeys = Object.keys(ctx.prependRelations);
  if (prependRelationsKeys.length) {
    pushQueryArray(
      q,
      'beforeQuery',
      prependRelationsKeys.map((relationName) => {
        return async (q: Query) => {
          const relationData = ctx.prependRelations[relationName];
          const relation = ctx.relations[relationName];

          const inserted = await (
            relation.nestedInsert as BelongsToNestedInsert
          )(
            q,
            relationData.map(([, , data]) => data as NestedInsertOneItem),
          );

          const primaryKey = (relation as BelongsToRelation).options.primaryKey;
          relationData.forEach(([rowIndex, columnIndex], index) => {
            (values as unknown[][])[rowIndex][columnIndex] =
              inserted[index][primaryKey];
          });
        };
      }),
    );
  }

  const appendRelationsKeys = Object.keys(ctx.appendRelations);
  if (appendRelationsKeys.length) {
    if (!returning?.includes('*')) {
      const requiredColumns = Object.keys(ctx.requiredReturning);

      if (!returning) {
        q.query.select = requiredColumns;
      } else {
        q.query.select = [
          ...new Set([...(returning as string[]), ...requiredColumns]),
        ];
      }
    }

    let resultOfTypeAll: Record<string, unknown>[] | undefined;
    if (returnType !== 'all') {
      const { handleResult } = q.query;
      q.query.handleResult = async (q, queryResult) => {
        resultOfTypeAll = (await handleResult(q, queryResult)) as Record<
          string,
          unknown
        >[];

        if (queryMethodByReturnType[returnType] === 'arrays') {
          queryResult.rows.forEach(
            (row, i) =>
              ((queryResult.rows as unknown as unknown[][])[i] =
                Object.values(row)),
          );
        }

        return parseResult(q, returnType, queryResult);
      };
    }

    pushQueryArray(
      q,
      'afterQuery',
      appendRelationsKeys.map((relationName) => {
        return (q: Query, result: Record<string, unknown>[]) => {
          const all = resultOfTypeAll || result;
          return (
            ctx.relations[relationName].nestedInsert as HasOneNestedInsert
          )?.(
            q,
            ctx.appendRelations[relationName].map(([rowIndex, data]) => [
              all[rowIndex],
              data as NestedInsertOneItem,
            ]),
          );
        };
      }),
    );
  }

  if (prependRelationsKeys.length || appendRelationsKeys.length) {
    q.query.wrapInTransaction = true;
  }

  q.query.returnType = appendRelationsKeys.length ? 'all' : returnType;

  return q;
};

export class Create {
  create<T extends Query>(this: T, data: CreateData<T>): CreateResult<T> {
    return this.clone()._create(data);
  }
  _create<T extends Query>(this: T, data: CreateData<T>): CreateResult<T> {
    handleSelect(this);
    const ctx = createCtx(this);
    return insert(
      this,
      handleOneData(this, data, ctx),
      getSingleReturnType(this),
      ctx,
    ) as CreateResult<T>;
  }

  createMany<T extends Query>(
    this: T,
    data: CreateData<T>[],
  ): CreateManyResult<T> {
    return this.clone()._createMany(data);
  }
  _createMany<T extends Query>(
    this: T,
    data: CreateData<T>[],
  ): CreateManyResult<T> {
    handleSelect(this);
    const ctx = createCtx(this);
    return insert(
      this,
      handleManyData(this, data, ctx),
      getManyReturnType(this),
      ctx,
    ) as CreateManyResult<T>;
  }

  createRaw<T extends Query>(
    this: T,
    data: CreateRawData,
  ): CreateManyResult<T> {
    return this.clone()._createRaw(data);
  }
  _createRaw<T extends Query>(
    this: T,
    data: CreateRawData,
  ): CreateManyResult<T> {
    handleSelect(this);
    return insert(this, data, getManyReturnType(this)) as CreateManyResult<T>;
  }

  createFrom<
    T extends Query,
    Q extends Query & { returnType: 'one' | 'oneOrThrow' },
  >(
    this: T,
    query: Q,
    data: Omit<CreateData<T>, keyof Q['result']>,
  ): SetQueryReturnsOne<T> {
    return this.clone()._createFrom(query, data);
  }
  _createFrom<
    T extends Query,
    Q extends Query & { returnType: 'one' | 'oneOrThrow' },
  >(
    this: T,
    query: Q,
    data: Omit<CreateData<T>, keyof Q['result']>,
  ): SetQueryReturnsOne<T> {
    if (!queryTypeWithLimitOne[query.query.returnType]) {
      throw new Error(
        'createFrom accepts only a query which returns one record',
      );
    }

    if (!this.query.select) {
      this.query.select = ['*'];
    }

    const ctx = createCtx(this);

    const queryColumns: string[] = [];
    query.query.select?.forEach((item) => {
      if (typeof item === 'string') {
        const index = item.indexOf('.');
        queryColumns.push(index === -1 ? item : item.slice(index + 1));
      } else if ('selectAs' in item) {
        queryColumns.push(...Object.keys(item.selectAs));
      }
    });

    const { columns, values } = handleOneData(this, data, ctx);
    queryColumns.push(...columns);

    return insert(
      this,
      { columns: queryColumns, values },
      'one',
      ctx,
      query,
    ) as SetQueryReturnsOne<T>;
  }

  defaults<T extends Query, Data extends Partial<CreateData<T>>>(
    this: T,
    data: Data,
  ): T & {
    [defaultsKey]: Record<keyof Data, true>;
  } {
    return (this.clone() as T)._defaults(data);
  }
  _defaults<T extends Query, Data extends Partial<CreateData<T>>>(
    this: T,
    data: Data,
  ): T & { [defaultsKey]: Record<keyof Data, true> } {
    this.query.defaults = data;
    return this as T & { [defaultsKey]: Record<keyof Data, true> };
  }

  onConflict<T extends Query, Arg extends OnConflictArg<T>>(
    this: T,
    arg?: Arg,
  ): OnConflictQueryBuilder<T, Arg> {
    return this.clone()._onConflict(arg);
  }
  _onConflict<
    T extends Query,
    Arg extends OnConflictArg<T> | undefined = undefined,
  >(this: T, arg?: Arg): OnConflictQueryBuilder<T, Arg> {
    return new OnConflictQueryBuilder(this, arg as Arg);
  }
}

export class OnConflictQueryBuilder<
  T extends Query,
  Arg extends OnConflictArg<T> | undefined,
> {
  constructor(private query: T, private onConflict: Arg) {}

  ignore(): T {
    (this.query.query as InsertQueryData).onConflict = {
      type: 'ignore',
      expr: this.onConflict as OnConflictItem,
    };
    return this.query;
  }

  merge(
    update?:
      | keyof T['shape']
      | (keyof T['shape'])[]
      | Partial<T['inputType']>
      | RawExpression,
  ): T {
    (this.query.query as InsertQueryData).onConflict = {
      type: 'merge',
      expr: this.onConflict as OnConflictItem,
      update: update as OnConflictMergeUpdate,
    };
    return this.query;
  }
}