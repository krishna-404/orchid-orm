import { toSql } from './sql/toSql';
import {
  AliasOrTable,
  Column,
  Expression,
  isRaw,
  raw,
  RawExpression,
} from './common';
import {
  AddQueryJoinedTable,
  AddQuerySelect,
  AddQueryWith,
  FinalizeQueryResult,
  Query,
  QueryWithData,
  SetQuery,
  SetQueryReturnsAll,
  SetQueryReturnsOne,
  SetQueryReturnsRows,
  SetQueryReturnsValue,
  SetQueryReturnsVoid,
  SetQueryTableAlias,
  SetQueryWindows,
} from './query';
import { GetTypesOrRaw, PropertyKeyUnionToArray } from './utils';
import {
  HavingArg,
  OrderBy,
  QueryData,
  UnionArg,
  WhereItem,
  WindowArg,
} from './sql/types';
import { ColumnsShape, dataTypes, DataTypes, Output } from './schema';
import {
  pushQueryArray,
  pushQueryValue,
  removeFromQuery,
  setQueryValue,
} from './queryDataUtils';
import {
  Then,
  thenAll,
  thenOne,
  thenRows,
  thenValue,
  thenVoid,
} from './thenMethods';

type SelectResult<T extends Query, K extends Column<T>[]> = AddQuerySelect<
  T,
  Pick<T['type'], K[number]>
>;

type SelectAsArg<T extends Query> = Record<
  string,
  Column<T> | Query | RawExpression
>;

type SelectAsResult<T extends Query, S extends SelectAsArg<T>> = AddQuerySelect<
  T,
  {
    [K in keyof S]: S[K] extends keyof T['type']
      ? T['type'][S[K]]
      : S[K] extends RawExpression<infer Type>
      ? Type
      : S[K] extends Query
      ? FinalizeQueryResult<S[K]>
      : never;
  }
>;

type FromArgs<T extends Query> = [
  arg: Query | RawExpression | Exclude<keyof T['withData'], symbol | number>,
  as?: string,
];

type FromResult<
  T extends Query,
  Args extends FromArgs<T>,
> = Args[1] extends string
  ? SetQueryTableAlias<T, Args[1]>
  : Args[0] extends string
  ? SetQueryTableAlias<T, Args[0]>
  : Args[0] extends Query
  ? SetQueryTableAlias<T, AliasOrTable<Args[0]>>
  : T;

type WithArgs =
  | [
      string,
      ColumnsShape | ((t: DataTypes) => ColumnsShape),
      Query | RawExpression,
    ]
  | [
      string,
      true,
      ColumnsShape | ((t: DataTypes) => ColumnsShape),
      Query | RawExpression,
    ];

type WithShape<Args extends WithArgs> = Args[1] extends ColumnsShape
  ? Args[1]
  : Args[2] extends ColumnsShape
  ? Args[2]
  : Args[1] extends (t: DataTypes) => ColumnsShape
  ? ReturnType<Args[1]>
  : Args[2] extends (t: DataTypes) => ColumnsShape
  ? ReturnType<Args[2]>
  : never;

type WithResult<
  T extends Query,
  Args extends WithArgs,
  Shape extends ColumnsShape,
> = AddQueryWith<
  T,
  {
    table: Args[0];
    shape: Shape;
    type: Output<Shape>;
  }
>;

type WindowResult<T extends Query, W extends WindowArg<T>> = SetQueryWindows<
  T,
  PropertyKeyUnionToArray<keyof W>
>;

type JoinCallbackQuery<T extends Query, J extends Query> = AddQueryJoinedTable<
  J,
  T
> &
  JoinCallbackMethods<T>;

type JoinCallbackMethods<J extends Query> = {
  on: On<J>;
  _on: On<J>;
  onOr: On<J>;
  _onOr: On<J>;
};

type On<J extends Query> = <T extends Query & JoinCallbackMethods<J>>(
  this: T,
  leftColumn: Column<T>,
  op: string,
  rightColumn: Column<T>,
) => T;

const on: On<Query> = function (leftColumn, op, rightColumn) {
  return this._on(leftColumn, op, rightColumn);
};

const _on: On<Query> = function (leftColumn, op, rightColumn) {
  return pushQueryValue(this, 'and', [leftColumn, op, rightColumn]);
};

const onOr: On<Query> = function (leftColumn, op, rightColumn) {
  return this._on(leftColumn, op, rightColumn);
};

const _onOr: On<Query> = function (leftColumn, op, rightColumn) {
  return pushQueryArray(this, 'or', [[leftColumn, op, rightColumn]]);
};

const joinCallbackMethods: JoinCallbackMethods<Query> = {
  on,
  _on,
  onOr,
  _onOr,
};

type JoinArg<
  T extends Query,
  Q extends Query,
  Rel extends keyof T['relations'] | undefined,
> =
  | [relation: Rel]
  | [query: Q, leftColumn: Column<Q>, op: string, rightColumn: Column<T>]
  | [query: Q, raw: RawExpression]
  | [query: Q, on: (q: JoinCallbackQuery<T, Q>) => Query];

type JoinResult<
  T extends Query,
  Q extends Query,
  Rel extends keyof T['relations'] | undefined,
> = AddQueryJoinedTable<
  T,
  Rel extends keyof T['relations'] ? T['relations'][Rel]['query'] : Q
>;

export class QueryMethods {
  then!: Then<unknown>;
  windows!: PropertyKey[];
  private __model?: Query;

  all<T extends Query>(this: T): SetQueryReturnsAll<T> {
    return this.then === thenAll
      ? (this.toQuery() as unknown as SetQueryReturnsAll<T>)
      : this.clone()._all();
  }

  _all<T extends Query>(this: T): SetQueryReturnsAll<T> {
    const q = this.toQuery();
    q.then = thenAll;
    removeFromQuery(q, 'take');
    return q as unknown as SetQueryReturnsAll<T>;
  }

  take<T extends Query>(this: T): SetQueryReturnsOne<T> {
    return this.then === thenOne
      ? (this as unknown as SetQueryReturnsOne<T>)
      : this.clone()._take();
  }

  _take<T extends Query>(this: T): SetQueryReturnsOne<T> {
    const q = this.toQuery();
    q.then = thenOne;
    setQueryValue(q, 'take', true);
    return q as unknown as SetQueryReturnsOne<T>;
  }

  rows<T extends Query>(this: T): SetQueryReturnsRows<T> {
    return this.then === thenRows
      ? (this as unknown as SetQueryReturnsRows<T>)
      : this.clone()._rows();
  }

  _rows<T extends Query>(this: T): SetQueryReturnsRows<T> {
    const q = this.toQuery();
    q.then = thenRows;
    removeFromQuery(q, 'take');
    return q as unknown as SetQueryReturnsRows<T>;
  }

  value<T extends Query, V>(this: T): SetQueryReturnsValue<T, V> {
    return this.then === thenValue
      ? (this as unknown as SetQueryReturnsValue<T, V>)
      : this.clone()._value<T, V>();
  }

  _value<T extends Query, V>(this: T): SetQueryReturnsValue<T, V> {
    const q = this.toQuery();
    q.then = thenValue;
    removeFromQuery(q, 'take');
    return q as unknown as SetQueryReturnsValue<T, V>;
  }

  exec<T extends Query>(this: T): SetQueryReturnsVoid<T> {
    return this.then === thenVoid
      ? (this as unknown as SetQueryReturnsVoid<T>)
      : this.clone()._exec();
  }

  _exec<T extends Query>(this: T): SetQueryReturnsVoid<T> {
    const q = this.toQuery();
    q.then = thenVoid;
    removeFromQuery(q, 'take');
    return q as unknown as SetQueryReturnsVoid<T>;
  }

  toQuery<T extends Query>(this: T): QueryWithData<T> {
    if (this.query) return this as QueryWithData<T>;
    const q = this.clone();
    return q as QueryWithData<T>;
  }

  clone<T extends Query>(this: T): QueryWithData<T> {
    let cloned;
    if (this.__model) {
      cloned = Object.create(this.__model);
      cloned.__model = this.__model;
    } else {
      cloned = Object.create(this);
      cloned.__model = this;
    }

    cloned.then = this.then;
    cloned.query = {};

    if (this.query) {
      for (const key in this.query) {
        const value = this.query[key as keyof QueryData<T>];
        if (Array.isArray(value)) {
          (cloned.query as Record<string, unknown>)[key] = [...value];
        } else {
          (cloned.query as Record<string, unknown>)[key] = value;
        }
      }
    }

    return cloned as unknown as QueryWithData<T>;
  }

  toSql(this: Query): string {
    return toSql(this);
  }

  asType<T extends Query>(this: T): <S>() => SetQuery<T, S> {
    return <S>() => this as unknown as SetQuery<T, S>;
  }

  select<T extends Query, K extends Column<T>[]>(
    this: T,
    ...columns: K
  ): SelectResult<T, K> {
    return this.clone()._select(...columns);
  }

  _select<T extends Query, K extends Column<T>[]>(
    this: T,
    ...columns: K
  ): SelectResult<T, K> {
    if (!columns.length) return this;
    return pushQueryArray(this, 'select', columns);
  }

  selectAs<T extends Query, S extends SelectAsArg<T>>(
    this: T,
    select: S,
  ): SelectAsResult<T, S> {
    return this.clone()._selectAs(select) as any;
  }

  _selectAs<T extends Query, S extends SelectAsArg<T>>(
    this: T,
    select: S,
  ): SelectAsResult<T, S> {
    return pushQueryValue(this, 'select', { selectAs: select });
  }

  distinct<T extends Query>(this: T, ...columns: Expression<T>[]): T {
    return this.clone()._distinct(...columns);
  }

  _distinct<T extends Query>(this: T, ...columns: Expression<T>[]): T {
    return pushQueryArray(this, 'distinct', columns as string[]);
  }

  and<T extends Query>(this: T, ...args: WhereItem<T>[]): T {
    return this.where(...args);
  }

  _and<T extends Query>(this: T, ...args: WhereItem<T>[]): T {
    return this._where(...args);
  }

  where<T extends Query>(this: T, ...args: WhereItem<T>[]): T {
    return this.clone()._where(...args);
  }

  _where<T extends Query>(this: T, ...args: WhereItem<T>[]): T {
    return pushQueryArray(this, 'and', args);
  }

  or<T extends Query>(this: T, ...args: WhereItem<T>[]): T {
    return this.clone()._or(...args);
  }

  _or<T extends Query>(this: T, ...args: WhereItem<T>[]): T {
    return pushQueryArray(
      this,
      'or',
      args.map((arg) => [arg]),
    );
  }

  find<T extends Query>(
    this: T,
    ...args: GetTypesOrRaw<T['primaryTypes']>
  ): SetQueryReturnsOne<T> {
    return this.clone()._find(...args);
  }

  _find<T extends Query>(
    this: T,
    ...args: GetTypesOrRaw<T['primaryTypes']>
  ): SetQueryReturnsOne<T> {
    const conditions: Partial<Output<T['shape']>> = {};
    this.primaryKeys.forEach((key: string, i: number) => {
      conditions[key as keyof Output<T['shape']>] = args[i];
    });
    return this._where(conditions)._take();
  }

  findBy<T extends Query>(
    this: T,
    ...args: WhereItem<T>[]
  ): SetQueryReturnsOne<T> {
    return this.clone()._findBy(...args);
  }

  _findBy<T extends Query>(
    this: T,
    ...args: WhereItem<T>[]
  ): SetQueryReturnsOne<T> {
    return this._where(...args).take();
  }

  as<T extends Query, TableAlias extends string>(
    this: T,
    tableAlias: TableAlias,
  ): SetQueryTableAlias<T, TableAlias> {
    return this.clone()._as(tableAlias);
  }

  _as<T extends Query, TableAlias extends string>(
    this: T,
    tableAlias: TableAlias,
  ): SetQueryTableAlias<T, TableAlias> {
    return setQueryValue(
      this,
      'as',
      tableAlias,
    ) as unknown as SetQueryTableAlias<T, TableAlias>;
  }

  from<T extends Query, Args extends FromArgs<T>>(
    this: T,
    ...args: Args
  ): FromResult<T, Args> {
    return this.clone()._from(...args);
  }

  _from<T extends Query, Args extends FromArgs<T>>(
    this: T,
    ...args: Args
  ): FromResult<T, Args> {
    let as: string | undefined;
    if (typeof args[1] === 'string') {
      as = args[1];
    } else if (typeof args[0] === 'string') {
      as = args[0];
    } else if (!isRaw(args[0] as RawExpression)) {
      as = (args[0] as Query).query?.as || (args[0] as Query).table;
    }

    return setQueryValue(
      as ? this._as(as) : this,
      'from',
      args[0],
    ) as unknown as FromResult<T, Args>;
  }

  with<
    T extends Query,
    Args extends WithArgs,
    Shape extends ColumnsShape = WithShape<Args>,
  >(this: T, ...args: Args): WithResult<T, Args, Shape> {
    return this.clone()._with<T, Args, Shape>(...args);
  }

  _with<
    T extends Query,
    Args extends WithArgs,
    Shape extends ColumnsShape = WithShape<Args>,
  >(this: T, ...args: Args): WithResult<T, Args, Shape> {
    return pushQueryValue(this, 'with', [
      args[0],
      args[1] === true
        ? Object.keys(
            typeof args[2] === 'object' ? args[2] : args[2](dataTypes),
          )
        : false,
      args.length === 3 ? args[2] : args[3],
    ]) as unknown as WithResult<T, Args, Shape>;
  }

  group<T extends Query>(
    this: T,
    ...columns: (keyof T['type'] | RawExpression)[]
  ): T {
    return this.clone()._group(...columns);
  }

  _group<T extends Query>(
    this: T,
    ...columns: (keyof T['type'] | RawExpression)[]
  ): T {
    return pushQueryArray(this, 'group', columns as string[]);
  }

  having<T extends Query>(this: T, ...args: HavingArg<T>[]): T {
    return this.clone()._having(...args);
  }

  _having<T extends Query>(this: T, ...args: HavingArg<T>[]): T {
    return pushQueryArray(this, 'having', args);
  }

  window<T extends Query, W extends WindowArg<T>>(
    this: T,
    arg: W,
  ): WindowResult<T, W> {
    return this.clone()._window(arg);
  }

  _window<T extends Query, W extends WindowArg<T>>(
    this: T,
    arg: W,
  ): WindowResult<T, W> {
    return pushQueryValue(this, 'window', arg) as unknown as WindowResult<T, W>;
  }

  wrap<T extends Query, Q extends Query, As extends string = 't'>(
    this: T,
    query: Q,
    as?: As,
  ): SetQueryTableAlias<Q, As> {
    return this.clone()._wrap(query, as);
  }

  _wrap<T extends Query, Q extends Query, As extends string = 't'>(
    this: T,
    query: Q,
    as?: As,
  ): SetQueryTableAlias<Q, As> {
    return query
      ._as(as ?? 't')
      ._from(raw(`(${this.toSql()})`)) as unknown as SetQueryTableAlias<Q, As>;
  }

  json<T extends Query>(this: T): SetQueryReturnsValue<T, string> {
    return this.clone()._json();
  }

  _json<T extends Query>(this: T): SetQueryReturnsValue<T, string> {
    const q = this._wrap(
      this.selectAs({
        json: raw(
          this.query?.take
            ? `COALESCE(row_to_json("t".*), '{}')`
            : `COALESCE(json_agg(row_to_json("t".*)), '[]')`,
        ),
      }),
    );

    return q._value<typeof q, string>() as unknown as SetQueryReturnsValue<
      T,
      string
    >;
  }

  union<T extends Query>(this: T, ...args: UnionArg<T>[]): T {
    return this._union(...args);
  }

  _union<T extends Query>(this: T, ...args: UnionArg<T>[]): T {
    return pushQueryArray(
      this,
      'union',
      args.map((arg) => ({ arg, kind: 'UNION' as const })),
    );
  }

  unionAll<T extends Query>(this: T, ...args: UnionArg<T>[]): T {
    return this._unionAll(...args);
  }

  _unionAll<T extends Query>(this: T, ...args: UnionArg<T>[]): T {
    return pushQueryArray(
      this,
      'union',
      args.map((arg) => ({ arg, kind: 'UNION ALL' as const })),
    );
  }

  intersect<T extends Query>(this: T, ...args: UnionArg<T>[]): T {
    return this._intersect(...args);
  }

  _intersect<T extends Query>(this: T, ...args: UnionArg<T>[]): T {
    return pushQueryArray(
      this,
      'union',
      args.map((arg) => ({ arg, kind: 'INTERSECT' as const })),
    );
  }

  intersectAll<T extends Query>(this: T, ...args: UnionArg<T>[]): T {
    return this._intersectAll(...args);
  }

  _intersectAll<T extends Query>(this: T, ...args: UnionArg<T>[]): T {
    return pushQueryArray(
      this,
      'union',
      args.map((arg) => ({ arg, kind: 'INTERSECT ALL' as const })),
    );
  }

  except<T extends Query>(this: T, ...args: UnionArg<T>[]): T {
    return this._except(...args);
  }

  _except<T extends Query>(this: T, ...args: UnionArg<T>[]): T {
    return pushQueryArray(
      this,
      'union',
      args.map((arg) => ({ arg, kind: 'EXCEPT' as const })),
    );
  }

  exceptAll<T extends Query>(this: T, ...args: UnionArg<T>[]): T {
    return this._exceptAll(...args);
  }

  _exceptAll<T extends Query>(this: T, ...args: UnionArg<T>[]): T {
    return pushQueryArray(
      this,
      'union',
      args.map((arg) => ({ arg, kind: 'EXCEPT ALL' as const })),
    );
  }

  order<T extends Query>(this: T, ...args: OrderBy<T>[]): T {
    return this.clone()._order(...args);
  }

  _order<T extends Query>(this: T, ...args: OrderBy<T>[]): T {
    return pushQueryArray(this, 'order', args);
  }

  limit<T extends Query>(this: T, arg: number): T {
    return this.clone()._limit(arg);
  }

  _limit<T extends Query>(this: T, arg: number): T {
    return setQueryValue(this, 'limit', arg);
  }

  offset<T extends Query>(this: T, arg: number): T {
    return this.clone()._offset(arg);
  }

  _offset<T extends Query>(this: T, arg: number): T {
    return setQueryValue(this, 'offset', arg);
  }

  for<T extends Query>(this: T, ...args: RawExpression[]): T {
    return this.clone()._for(...args);
  }

  _for<T extends Query>(this: T, ...args: RawExpression[]): T {
    return pushQueryArray(this, 'for', args);
  }

  exists<T extends Query>(this: T): SetQueryReturnsValue<T, { exists: 1 }> {
    return this.clone()._exists();
  }

  _exists<T extends Query>(this: T): SetQueryReturnsValue<T, { exists: 1 }> {
    const q = setQueryValue(this, 'select', [
      { selectAs: { exists: raw('1') } },
    ]);
    return q._value<T, { exists: 1 }>();
  }

  join<
    T extends Query,
    Q extends Query,
    Rel extends keyof T['relations'] | undefined = undefined,
  >(this: T, ...args: JoinArg<T, Q, Rel>): JoinResult<T, Q, Rel> {
    return this.clone()._join(...args);
  }

  _join<
    T extends Query,
    Q extends Query,
    Rel extends keyof T['relations'] | undefined = undefined,
  >(this: T, ...args: JoinArg<T, Q, Rel>): JoinResult<T, Q, Rel> {
    if (typeof args[0] === 'object' && typeof args[1] === 'function') {
      const [model, arg] = args;
      const q = model.clone();
      const clone = q.clone;
      q.clone = function <T extends Query>(this: T): QueryWithData<T> {
        const cloned = clone.call(q);
        Object.assign(cloned, joinCallbackMethods);
        return cloned as QueryWithData<T>;
      };
      Object.assign(q, joinCallbackMethods);

      const resultQuery = arg(q as unknown as JoinCallbackQuery<T, Q>);
      return pushQueryValue(this, 'join', [
        model,
        resultQuery,
      ]) as unknown as JoinResult<T, Q, Rel>;
    } else {
      return pushQueryValue(this, 'join', args) as unknown as JoinResult<
        T,
        Q,
        Rel
      >;
    }
  }
}

QueryMethods.prototype.then = thenAll;
