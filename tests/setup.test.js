import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, expect, test } from 'vitest';

let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-so-cong-dau',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

test('a client that is not signed in cannot read orders/x', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'orders/x')));
  expect(true).toBe(true);
});
