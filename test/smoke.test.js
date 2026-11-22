import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

test('static server serves /health and /', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.ok, true);

    const indexRes = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(indexRes.status, 200);
    const html = await indexRes.text();
    assert.match(html, /<canvas id="game"/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
