import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.js";

test("serves the app and protects admin trip changes with a PIN", async () => {
  const directory = await mkdtemp(join(tmpdir(), "temple-ride-server-"));
  const server = createAppServer({ dataFile: join(directory, "state.json"), adminPin: "1357" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const pageResponse = await fetch(baseUrl);
    assert.equal(pageResponse.status, 200);
    assert.match(await pageResponse.text(), /Temple Ride/);

    const deniedResponse = await fetch(`${baseUrl}/api/trips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(deniedResponse.status, 401);

    const verifiedResponse = await fetch(`${baseUrl}/api/admin/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1357" })
    });
    assert.equal(verifiedResponse.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
