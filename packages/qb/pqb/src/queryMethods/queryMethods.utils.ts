import { Query, SetQueryTableAlias } from '../query/query';
import { _queryAs } from './as';
import { queryFrom } from './from';
import { WrapQueryArg } from './queryMethods';
import { emptyObject, PickQueryTableMetaResult } from 'orchid-core';

export function queryWrap<
  T extends PickQueryTableMetaResult,
  Q extends WrapQueryArg,
  As extends string = 't',
>(self: T, query: Q, as: As = 't' as As): SetQueryTableAlias<Q, As> {
  return _queryAs(queryFrom(query, self), as) as never;
}

/**
 * This function is useful when wrapping a query,
 * such as when doing `SELECT json_agg(t.*) FROM (...) AS t`,
 * to get rid of default scope conditions (WHERE deletedAt IS NULL)
 * that otherwise would be duplicated inside the `FROM` and after `AS t`.
 */
export function cloneQueryBaseUnscoped(query: Query) {
  const q = query.baseQuery.clone();
  q.q.or = q.q.and = undefined;
  q.q.scopes = emptyObject;
  return q;
}
