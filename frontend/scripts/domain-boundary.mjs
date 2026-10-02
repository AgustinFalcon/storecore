import ts from 'typescript';
import { posix } from 'node:path';

/** Inspect all domain source files, including use cases, ports and their pure tests. */
export function domainBoundaryFailures(path, text) {
  const rel = path.replaceAll('\\', '/');
  if (!rel.startsWith('domain/')) return [];
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
  const failures = [];

  function inspectName(name, pathReference = false) {
    const target = pathReference ? name.replaceAll('\\', '/') : name;
    const absoluteReference = pathReference && /^(?:[A-Za-z]:|\/)/.test(target);
    const resolved = (pathReference || target.startsWith('.')) && !absoluteReference
      ? posix.normalize(posix.join(posix.dirname(rel), target)) : null;
    if (absoluteReference || /^@(angular|ngrx)(\/|$)/.test(target) || (resolved && !resolved.startsWith('domain/')) ||
        (!resolved && target !== 'rxjs' && !target.startsWith('rxjs/'))) {
      failures.push(`${rel}: domain must not depend on framework or outer layers (${name})`);
    }
  }

  function inspect(specifier) {
    if (!specifier) return;
    if (!ts.isStringLiteralLike(specifier)) {
      failures.push(`${rel}: domain dependency must have a statically inspectable module specifier`);
      return;
    }
    inspectName(specifier.text);
  }

  source.typeReferenceDirectives.forEach((reference) => inspectName(reference.fileName));
  source.referencedFiles.forEach((reference) => inspectName(reference.fileName, true));

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) inspect(node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) inspect(node.moduleReference.expression);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) inspect(node.argument.literal);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) inspect(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...new Set(failures)];
}
