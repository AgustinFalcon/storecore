import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

import { parser } from 'typescript-eslint';

const root = process.cwd();
const requireFromEstree = createRequire(import.meta.resolve('@typescript-eslint/typescript-estree'));
const { minimatch } = requireFromEstree('minimatch');
const allowedPath = path.join(root, 'scripts', 'project-service-smoke', 'allowed.js');
const rejectedPath = path.join(root, 'scripts', 'project-service-smoke', 'nested', 'rejected.js');
const parserOptions = {
  filePath: allowedPath,
  projectService: {
    allowDefaultProject: ['scripts/project-service-smoke/*.js'],
  },
  tsconfigRootDir: root,
};

test('projectService parses an allowed default-project file with type information', () => {
  const result = parser.parseForESLint('const answer = 42;\n', parserOptions);

  assert.ok(result.services.program, 'the allowed file must receive a TypeScript Program');
  assert.ok(result.services.program.getTypeChecker(), 'the program must expose its type checker');
  assert.ok(
    result.services.program.getSourceFile(allowedPath),
    'the allowed file must belong to the default project',
  );
});

test('projectService rejects a file outside allowDefaultProject', () => {
  assert.throws(
    () =>
      parser.parseForESLint('const rejected = true;\n', {
        ...parserOptions,
        filePath: rejectedPath,
      }),
    /allowDefaultProject|project service/i,
  );
});

test('the overridden minimatch keeps the consumer API and dot semantics', () => {
  assert.equal(minimatch('.allowed.js', '*.js', { dot: true }), true);
  assert.equal(minimatch('.allowed.js', '*.js'), false);
  assert.equal(minimatch('nested/rejected.js', '*.js', { dot: true }), false);
});
