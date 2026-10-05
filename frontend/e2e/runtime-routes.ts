import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

/** Parse route configuration without bootstrapping Angular or replacing its runtime guards. */
export function runtimeLeafPaths(): string[] {
  return leafPathsFromSource(readFileSync(resolve('src/app/app.routes.ts'), 'utf8'));
}

export function leafPathsFromSource(text: string): string[] {
  const source = ts.createSourceFile('app.routes.ts', text,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let initializer: ts.Expression | undefined;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === 'routes') initializer = declaration.initializer;
    }
  }
  const paths: string[] = [];
  function visit(expression: ts.Expression | undefined, parent: string): void {
    if (!expression || !ts.isArrayLiteralExpression(expression)) throw new Error('Routes must have an explicit reviewed array');
    for (const entry of expression.elements) {
      if (!ts.isObjectLiteralExpression(entry)) throw new Error('Unsupported route entry; reconcile the manifest reader');
      const fields = new Map<string, ts.Expression>();
      for (const field of entry.properties) {
        if (!ts.isPropertyAssignment(field) || !(ts.isIdentifier(field.name) || ts.isStringLiteral(field.name))) {
          throw new Error('Unsupported route property; reconcile the manifest reader');
        }
        fields.set(field.name.text, field.initializer);
      }
      const path = fields.get('path');
      if (!path || !ts.isStringLiteral(path)) throw new Error('Route path must be literal');
      const full = [parent, path.text].filter(Boolean).join('/');
      if (fields.has('loadChildren') || fields.has('loadComponent')) {
        throw new Error('Lazy route topology is unsupported; reconcile the inventory reader');
      }
      const children = fields.get('children');
      if (children && !ts.isArrayLiteralExpression(children)) throw new Error('Route children must be an explicit array');
      if (children && ts.isArrayLiteralExpression(children) && children.elements.length > 0) visit(children, full);
      else if (!fields.has('redirectTo') && fields.has('component')) paths.push('/' + full);
      else if (!fields.has('redirectTo')) throw new Error('Unclassified leaf route');
    }
  }
  visit(initializer, '');
  return paths.sort();
}
