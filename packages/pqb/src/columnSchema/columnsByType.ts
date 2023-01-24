import { ColumnType } from './columnType';
import { BooleanColumn } from './boolean';
import {
  BitColumn,
  BitVaryingColumn,
  BoxColumn,
  ByteaColumn,
  CharColumn,
  CidrColumn,
  CircleColumn,
  InetColumn,
  LineColumn,
  LsegColumn,
  MacAddr8Column,
  MacAddrColumn,
  MoneyColumn,
  PathColumn,
  PointColumn,
  PolygonColumn,
  TextColumn,
  TsQueryColumn,
  TsVectorColumn,
  UUIDColumn,
  VarCharColumn,
  XMLColumn,
} from './string';
import {
  BigIntColumn,
  BigSerialColumn,
  DecimalColumn,
  DoublePrecisionColumn,
  IntegerColumn,
  RealColumn,
  SerialColumn,
  SmallIntColumn,
  SmallSerialColumn,
} from './number';
import { JSONColumn, JSONTextColumn } from './json';
import {
  DateColumn,
  IntervalColumn,
  TimeColumn,
  TimestampColumn,
  TimeWithTimeZoneColumn,
} from './dateTime';

export const columnsByType: Record<
  string,
  new (...args: never[]) => ColumnType
> = {
  bool: BooleanColumn,
  boolean: BooleanColumn,
  bytea: ByteaColumn,
  char: CharColumn,
  int8: BigIntColumn,
  bigint: BigIntColumn,
  int2: SmallIntColumn,
  smallint: SmallIntColumn,
  int4: IntegerColumn,
  integer: IntegerColumn,
  text: TextColumn,
  json: JSONTextColumn,
  xml: XMLColumn,
  point: PointColumn,
  lseg: LsegColumn,
  path: PathColumn,
  box: BoxColumn,
  polygon: PolygonColumn,
  line: LineColumn,
  cidr: CidrColumn,
  float4: RealColumn,
  real: RealColumn,
  float8: DoublePrecisionColumn,
  'double precision': DoublePrecisionColumn,
  circle: CircleColumn,
  macaddr8: MacAddr8Column,
  money: MoneyColumn,
  macaddr: MacAddrColumn,
  inet: InetColumn,
  bpchar: CharColumn,
  character: CharColumn,
  varchar: VarCharColumn,
  'character varying': VarCharColumn,
  date: DateColumn,
  time: TimeColumn,
  'time without time zone': TimeColumn,
  timestamp: TimestampColumn,
  'timestamp without time zone': TimestampColumn,
  timestamptz: TimeWithTimeZoneColumn,
  'timestamp with time zone': TimeWithTimeZoneColumn,
  interval: IntervalColumn,
  timetz: TimeWithTimeZoneColumn,
  'time with time zone': TimeWithTimeZoneColumn,
  bit: BitColumn,
  varbit: BitVaryingColumn,
  'bit varying': BitVaryingColumn,
  numeric: DecimalColumn,
  decimal: DecimalColumn,
  uuid: UUIDColumn,
  tsvector: TsVectorColumn,
  tsquery: TsQueryColumn,
  jsonb: JSONColumn,
  smallserial: SmallSerialColumn,
  serial: SerialColumn,
  bigserial: BigSerialColumn,
};
