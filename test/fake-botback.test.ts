import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFakeBotBack } from '../scripts/fake-botback';
import { validatePositionsResponse } from '../src/botback';

test('fake bot-back serves valid data and can switch modes', async () => {
  const fake = await startFakeBotBack(0);
  try {
    const get = (path: string) => fetch(new URL(path, fake.url));

    const good = await get('/view/positions?date=2026-10-22');
    assert.equal(good.status, 200);
    const goodBody: unknown = await good.json();
    assert.equal(validatePositionsResponse(goodBody).ok, true);
    assert.equal((goodBody as { date: string }).date, '2026-10-22');

    const empty = await get('/_mode/empty');
    assert.equal(await empty.text(), 'mode=empty');
    const emptyBody = (await (await get('/view/positions?date=2026-10-21')).json()) as { positions: unknown[] };
    assert.deepEqual(emptyBody.positions, []);

    assert.equal((await get('/_mode/malformed')).status, 200);
    const bad = await get('/view/positions?date=2026-10-22');
    assert.equal(bad.status, 200);
    assert.equal(validatePositionsResponse(await bad.json()).ok, false);

    await get('/_mode/error');
    assert.equal((await get('/view/positions?date=2026-10-22')).status, 500);

    assert.equal((await get('/_mode/nope')).status, 404);
    assert.equal((await get('/other')).status, 404);
  } finally {
    await fake.close();
  }
});
