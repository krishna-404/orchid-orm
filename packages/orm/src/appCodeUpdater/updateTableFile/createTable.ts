import { RakeDbAst } from 'rake-db';
import { getImportPath } from '../utils';
import { Code, codeToString, columnsShapeToCode, singleQuote } from 'pqb';
import { toPascalCase } from '../../utils';
import fs from 'fs/promises';
import { UpdateTableFileParams } from './updateTableFile';

export const createTable = async ({
  ast,
  ...params
}: UpdateTableFileParams & { ast: RakeDbAst.Table }) => {
  const tablePath = params.tablePath(ast.name);
  const baseTablePath = getImportPath(tablePath, params.baseTablePath);

  const props: Code[] = [`table = ${singleQuote(ast.name)};`];
  if (ast.noPrimaryKey === 'ignore') {
    props.push('noPrimaryKey = true;');
  }

  props.push(
    'columns = this.setColumns((t) => ({',
    columnsShapeToCode(ast.shape, ast, 't'),
    '}));',
  );

  const code: Code[] = [
    `import { ${params.baseTableName} } from '${baseTablePath}';\n`,
    `export class ${toPascalCase(ast.name)} extends ${params.baseTableName} {`,
    props,
    '}',
  ];

  await fs.writeFile(tablePath, codeToString(code, '', '  '));
};
