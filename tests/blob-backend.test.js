import test from "node:test";
import assert from "node:assert/strict";
import { BlobPreconditionFailedError } from "@vercel/blob";
import { BlobStateBackend } from "../lib/blob-backend.js";
import { CarpoolStore, createInitialState } from "../lib/store.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class RevisionBackend {
  state = createInitialState();
  revision = 1;
  conflictMutation = null;

  async read() {
    return { state: clone(this.state), revision: String(this.revision) };
  }

  async write(state, revision) {
    if (this.conflictMutation) {
      this.conflictMutation(this.state);
      this.conflictMutation = null;
      this.revision += 1;
    }
    if (revision !== String(this.revision)) {
      const error = new Error("conflict");
      error.code = "STATE_CONFLICT";
      throw error;
    }
    this.state = clone(state);
    this.revision += 1;
    return String(this.revision);
  }
}

test("private Blob reads bypass cache and writes use the current ETag", async () => {
  const calls = [];
  const state = createInitialState();
  const backend = new BlobStateBackend({
    pathname: "temple-ride/test.json",
    token: "test-token",
    client: {
      async get(pathname, options) {
        calls.push({ method: "get", pathname, options });
        return {
          stream: new Response(JSON.stringify(state)).body,
          blob: { etag: 'W/"revision-one"' }
        };
      },
      async head(pathname, options) {
        calls.push({ method: "head", pathname, options });
        return { etag: '"revision-one"' };
      },
      async put(pathname, body, options) {
        calls.push({ method: "put", pathname, body, options });
        return { etag: "revision-two" };
      }
    }
  });

  const snapshot = await backend.read();
  const revision = await backend.write(snapshot.state, snapshot.revision);

  assert.equal(snapshot.revision, 'W/"revision-one"');
  assert.equal(revision, "revision-two");
  assert.deepEqual(calls[0], {
    method: "get",
    pathname: "temple-ride/test.json",
    options: { access: "private", useCache: false, token: "test-token" }
  });
  assert.deepEqual(calls[1], {
    method: "head",
    pathname: "temple-ride/test.json",
    options: { token: "test-token" }
  });
  assert.equal(calls[2].options.access, "private");
  assert.equal(calls[2].options.allowOverwrite, true);
  assert.equal(calls[2].options.ifMatch, '"revision-one"');
  assert.equal(calls[2].options.token, "test-token");
});

test("a stale Blob read is rejected before it can overwrite newer state", async () => {
  let putCalled = false;
  const backend = new BlobStateBackend({
    token: "test-token",
    client: {
      async get() { return null; },
      async head() { return { etag: '"revision-two"' }; },
      async put() {
        putCalled = true;
        return { etag: '"revision-three"' };
      }
    }
  });

  await assert.rejects(
    backend.write(createInitialState(), '"revision-one"'),
    (error) => error.code === "STATE_CONFLICT"
  );
  assert.equal(putCalled, false);
});

test("Blob precondition failures become retryable state conflicts", async () => {
  const backend = new BlobStateBackend({
    token: "test-token",
    client: {
      async get() { return null; },
      async put() { throw new BlobPreconditionFailedError(); }
    }
  });

  await assert.rejects(
    backend.write(createInitialState(), null),
    (error) => error.code === "STATE_CONFLICT"
  );
});

test("a shared-state conflict retries without losing the other signup", async () => {
  const backend = new RevisionBackend();
  const store = new CarpoolStore("unused.json", { backend });
  const trip = backend.state.trips[0];
  const driver = await store.addDriver(trip.id, { name: "Nash", seats: 3 });

  backend.conflictMutation = (state) => {
    state.trips[0].waitlist.push({ id: "other-rider", name: "Other Rider", createdAt: new Date().toISOString() });
  };
  await store.addRider(trip.id, { name: "Kylie", driverId: driver.id });

  const savedTrip = (await store.read()).trips[0];
  assert.equal(savedTrip.waitlist[0].name, "Other Rider");
  assert.equal(savedTrip.drivers[0].riders[0].name, "Kylie");
});
