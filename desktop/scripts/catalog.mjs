// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0.
// @author nich (@nichxbt)
// Extract data only: importing the server would also install process handlers.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { groupOf, isWriteTool } from '../../src/mcp/tool-groups.js';

const sourcePath = fileURLToPath(new URL('../../src/mcp/server.js', import.meta.url));
const outputPath = fileURLToPath(new URL('../src/data/catalog.json', import.meta.url));
const source = await readFile(sourcePath, 'utf8');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

function unsupported(node) {
  const { line, character } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
  throw new Error(`TOOLS must contain plain data: unsupported ${ts.SyntaxKind[node.kind]} at ${line + 1}:${character + 1}`);
}

/** Evaluate a small, explicit set of JSON-compatible AST nodes, never JavaScript. */
function literal(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(node.properties.map((property) => {
      if (!ts.isPropertyAssignment(property)) return unsupported(property);
      const name = property.name;
      if (!ts.isIdentifier(name) && !ts.isStringLiteral(name) && !ts.isNumericLiteral(name)) {
        return unsupported(name);
      }
      return [name.text, literal(property.initializer)];
    }));
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
    return -Number(node.operand.text);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = literal(node.left);
    const right = literal(node.right);
    if (typeof left === 'string' && typeof right === 'string') return left + right;
  }
  return unsupported(node);
}

const declarations = ast.statements
  .filter(ts.isVariableStatement)
  .flatMap((statement) => [...statement.declarationList.declarations]);
const definitions = declarations.filter((node) => ts.isIdentifier(node.name) && node.name.text === 'TOOLS');
if (definitions.length !== 1 || !definitions[0].initializer) {
  throw new Error('Expected exactly one top-level TOOLS constant in src/mcp/server.js');
}
const tools = literal(definitions[0].initializer);
if (!Array.isArray(tools) || tools.length === 0) throw new Error('TOOLS must be a non-empty array');
const names = new Set();
const catalog = tools.map((tool) => {
  if (!tool || typeof tool.name !== 'string' || typeof tool.description !== 'string' || tool.inputSchema?.type !== 'object') {
    throw new Error(`Invalid MCP tool definition: ${JSON.stringify(tool)}`);
  }
  if (names.has(tool.name)) throw new Error(`Duplicate MCP tool: ${tool.name}`);
  names.add(tool.name);
  return { ...tool, group: groupOf(tool.name), isWrite: isWriteTool(tool.name) };
});
const content = `${JSON.stringify(catalog, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const existing = await readFile(outputPath, 'utf8').catch(() => '');
  if (existing !== content) throw new Error('Desktop catalog is out of date. Run npm run catalog in desktop/.');
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, 'utf8');
}
const groups = new Set(catalog.map((tool) => tool.group));
console.log(`Catalog ${process.argv.includes('--check') ? 'verified' : 'generated'}: ${catalog.length} tools, ${groups.size} groups, ${catalog.filter((tool) => tool.isWrite).length} write tools.`);
