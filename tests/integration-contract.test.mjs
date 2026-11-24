import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';
import { toPaise } from '../src/amount.js';
const read = file => readFileSync(new URL(`../${file}`,import.meta.url),'utf8');

test('original Worker configuration remains unchanged', () => {
  assert.match(read('src/cloudflare-config.js'),/sharedbank-switch\.e-commerce-sriramtpsiog\.workers\.dev/);
  assert.match(read('src/LiveBank.jsx'),/prefix \+ '\/sign-in'/);
  assert.match(read('src/LiveBank.jsx'),/prefix \+ '\/transfers'/);
  assert.match(read('src/live-api.js'),/Idempotency-Key/);
});
test('demo-only credentials and fake local database removed', () => {
  assert.equal(existsSync(new URL('../src/demo-model.js', import.meta.url)),false);
  assert.equal(existsSync(new URL('../src/DemoBank.jsx', import.meta.url)),false);
  const code=read('src/BankApp.jsx');
  for (const secret of ['Demo@12345','Admin@12345','customer@gotham.test','admin@gotham.test','seedDemo','demo-model','passwordHash(']) assert.equal(code.includes(secret),false,secret);
  assert.match(code,/liveApi\(worker,prefix\+'\/sign-in'/);
  assert.match(code,/liveApi\(worker,prefix\+'\/transfers'/);
  assert.match(code,/portalApi\('\/admin\/snapshot'/);
});
test('money input validation remains unchanged', () => {
  assert.equal(toPaise('5000'),500000);
  assert.equal(toPaise('5000.25'),500025);
  assert.equal(toPaise('0'),null);
  assert.equal(toPaise('-50'),null);
});
test('privileged roles are verified by the backend', () => {
  const server=read('server/src/server.js');
  assert.match(server,/verifyIdToken\(token, true\)/);
  assert.match(server,/function requireAdmin/);
  assert.match(server,/const admins = new Set\(process\.env\.ADMIN_UIDS/);
  assert.match(server,/portalCreated/);
  assert.doesNotMatch(server,/demo-admin|admin@gotham\.test/);
});
test('no Firebase service account is bundled', () => {
  const paths=['src/BankApp.jsx','src/portal-api.js','server/src/server.js','server/.env.example'];
  for(const p of paths) assert.doesNotMatch(read(p),/-----BEGIN PRIVATE KEY-----/);
});
