import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = fileURLToPath(new URL('../apps/web/src/', import.meta.url));
const cache = new Map();
function load(relative) {
  const filename = path.join(root, relative);
  if (cache.has(filename)) return cache.get(filename);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  const localRequire = name => {
    if (name.startsWith('@/')) {
      const base = name.slice(2);
      for (const extension of ['.ts', '.tsx']) {
        try { readFileSync(path.join(root, base + extension)); return load(base + extension); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
    return require(name);
  };
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  cache.set(filename, module.exports);
  return module.exports;
}
const model = load('lib/learner-console.ts');
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const render = (component, props) => renderToStaticMarkup(createElement(component, props));

test('role navigation rejects unknown views and student fee access', () => {
  assert.equal(model.learnerView('fees', 'parent'), 'fees');
  assert.equal(model.learnerView('fees', 'student'), 'overview');
  assert.equal(model.learnerView('missing', 'parent'), 'overview');
  const { learnerLinks } = load('components/console/ConsoleNavigation.tsx');
  assert.ok(learnerLinks('parent').every(link => link.href.startsWith('/parent')));
  assert.ok(learnerLinks('student').every(link => link.href.startsWith('/student')));
  assert.ok(learnerLinks('student').some(link => link.view === 'schedule'));
});
test('attendance treats late as attended and excludes excused from denominator', () => {
  const records = ['present', 'late', 'absent', 'excused'].map(status => ({ date: '2026-11-13', batch_id: 'one', status }));
  assert.deepEqual(model.attendanceSummary(records), { present: 1, late: 1, absent: 1, counted: 3, rate: 67 });
  assert.equal(model.attendanceSummary([]).rate, 0);
});
test('notices match the selected child and exclude expired notices', () => {
  const student = { id: 'child', name: 'Aarav', class: '10' };
  const base = { id: 'notice', title: 'Update', body: '', created_at: '2026-11-01' };
  const now = new Date('2026-11-13T12:00:00Z');
  assert.ok(model.noticeForStudent({ ...base, audience: 'all' }, student, ['math'], now));
  assert.ok(model.noticeForStudent({ ...base, audience: 'batch', batch_id: 'math' }, student, ['math'], now));
  assert.equal(model.noticeForStudent({ ...base, audience: 'batch', batch_id: 'science' }, student, ['math'], now), false);
  assert.equal(model.noticeForStudent({ ...base, audience: 'class', class_id: '9' }, student, ['math'], now), false);
  assert.equal(model.noticeForStudent({ ...base, audience: 'all', expires_at: '2026-11-12' }, student, ['math'], now), false);
});
test('resource links reject active content and external protocol-relative URLs', () => {
  assert.equal(model.safeResourceUrl('javascript:alert(1)'), null);
  assert.equal(model.safeResourceUrl('data:text/html,example'), null);
  assert.equal(model.safeResourceUrl('//untrusted.example/path'), null);
  assert.equal(model.safeResourceUrl('/demo/algebra-practice.txt'), '/demo/algebra-practice.txt');
  assert.equal(model.safeResourceUrl('https://example.org/notes.pdf'), 'https://example.org/notes.pdf');
});
test('resources can be opened when downloads are disabled', () => {
  const { LearningResources } = load('components/console/LearningResources.tsx');
  const html = render(LearningResources, { materials: [{ id: 'resource', title: 'Read only notes', subject: 'Math', file_type: 'document', file_url: '/notes.pdf', allow_download: false }] });
  assert.match(html, /Open Read only notes/);
  assert.doesNotMatch(html, /Download Read only notes/);
});
test('family invoices stay in the parent console and demo checkout is disabled', () => {
  const FamilyFees = load('components/console/FamilyFees.tsx').default;
  const dues = [{ id: 'due', month: '2026-11-01', due_date: '2026-11-10', generated_amount: 3300, paid_amount: 1500, payments: [] }];
  const html = render(FamilyFees, { dues, studentName: 'Aarav', isDemo: true, refresh() {} });
  assert.match(html, /1,800/);
  assert.match(html, /disabled=""[^>]*>Pay online/);
  assert.doesNotMatch(html, /\/owner/);
  const compact = render(FamilyFees, { dues, studentName: 'Aarav', isDemo: true, compact: true, refresh() {} });
  assert.match(compact, /\/parent\?view=fees/);
  assert.equal(model.amountRemaining({ generated_amount: 100, paid_amount: 120 }), 0);
});
test('owner management shows operational tools and hides owner-only accounts for staff', () => {
  const { OwnerManagement } = load('components/console/OwnerConsoleModules.tsx');
  const owner = render(OwnerManagement, { role: 'owner' });
  assert.match(owner, /\/owner\/users/);
  assert.match(owner, /\/owner\/offline-attendance/);
  assert.match(owner, /\/owner\/notifications/);
  const staff = render(OwnerManagement, { role: 'staff' });
  assert.doesNotMatch(staff, /\/owner\/users/);
});
