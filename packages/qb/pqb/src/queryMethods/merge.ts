import {
  Query,
  GetQueryResult,
  PickQueryMetaResultReturnTypeWithDataWindows,
} from '../query/query';
import { SelectQueryData } from '../sql';
import {
  getValueKey,
  MergeObjects,
  PickQueryMetaResult,
  QueryCatch,
  QueryReturnType,
  QueryThen,
  RecordUnknown,
} from 'orchid-core';

export type MergeQuery<
  T extends PickQueryMetaResultReturnTypeWithDataWindows,
  Q extends PickQueryMetaResultReturnTypeWithDataWindows,
> = {
  [K in keyof T]: K extends 'meta'
    ? {
        [K in keyof T['meta'] | keyof Q['meta']]: K extends 'selectable'
          ? MergeObjects<T['meta']['selectable'], Q['meta']['selectable']>
          : K extends keyof Q['meta']
          ? Q['meta'][K]
          : T['meta'][K];
      }
    : K extends 'result'
    ? MergeQueryResult<T, Q>
    : K extends 'returnType'
    ? QueryReturnType extends Q['returnType']
      ? T['returnType']
      : Q['returnType']
    : K extends 'then'
    ? QueryThen<
        GetQueryResult<
          QueryReturnType extends Q['returnType']
            ? T['returnType']
            : Q['returnType'],
          MergeQueryResult<T, Q>
        >
      >
    : K extends 'catch'
    ? QueryCatch<
        GetQueryResult<
          QueryReturnType extends Q['returnType']
            ? T['returnType']
            : Q['returnType'],
          MergeQueryResult<T, Q>
        >
      >
    : K extends 'windows'
    ? MergeObjects<T['windows'], Q['windows']>
    : K extends 'withData'
    ? MergeObjects<T['withData'], Q['withData']>
    : T[K];
};

type MergeQueryResult<
  T extends PickQueryMetaResult,
  Q extends PickQueryMetaResult,
> = T['meta']['hasSelect'] extends true
  ? Q['meta']['hasSelect'] extends true
    ? {
        [K in
          | keyof T['result']
          | keyof Q['result']]: K extends keyof Q['result']
          ? Q['result'][K]
          : T['result'][K];
      }
    : T['result']
  : Q['result'];

const mergableObjects: Record<string, boolean> = {
  shape: true,
  withShapes: true,
  parsers: true,
  defaults: true,
  joinedShapes: true,
  joinedParsers: true,
};

export class MergeQueryMethods {
  merge<T extends Query, Q extends Query>(this: T, q: Q): MergeQuery<T, Q> {
    const query = this.clone();
    const a = query.q as RecordUnknown;
    const b = q.q as RecordUnknown;

    for (const key in b) {
      const value = b[key];
      switch (typeof value) {
        case 'boolean':
        case 'string':
        case 'number':
          a[key] = value;
          break;
        case 'object':
          if (Array.isArray(value)) {
            a[key] = a[key] ? [...(a[key] as unknown[]), ...value] : value;
          } else if (mergableObjects[key]) {
            a[key] = a[key]
              ? { ...(a[key] as RecordUnknown), ...value }
              : value;
          } else {
            a[key] = value;
          }
          break;
      }
    }

    (a as SelectQueryData)[getValueKey] = (b as SelectQueryData)[getValueKey];

    if (b.returnType) a.returnType = b.returnType;

    return query as never;
  }
}
