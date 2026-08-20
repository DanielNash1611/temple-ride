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
    assert.equal(pageResponse.headers.get("cache-control"), "no-cache");
    const page = await pageResponse.text();
    assert.match(page, /Temple Ride/);
    assert.match(page, /id="name-match-dialog"/);
    assert.match(page, /Members of this trusted group can edit or remove roster entries/);

    assert.match(page, /id="remove-person-confirmation"/);
    assert.match(page, /id="roster-remove-car-button"/);
    assert.match(page, /id="edit-person-confirmation"/);
    assert.match(page, /id="edit-person-remove"/);
    assert.match(page, /id="join-any-car-button"/);
    assert.match(page, /id="edit-rider-change-button"/);

    const scriptResponse = await fetch(`${baseUrl}/app.js?v=20260820`);
    assert.equal(scriptResponse.status, 200);
    assert.equal(scriptResponse.headers.get("cache-control"), "no-cache");

    const currentState = await (await fetch(`${baseUrl}/api/state`)).json();
    const tripId = currentState.activeTripId;
    const anyCarDriver = await (await fetch(`${baseUrl}/api/trips/${tripId}/drivers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Any Car Driver", seats: 1 })
    })).json();
    const anyCarResponse = await fetch(`${baseUrl}/api/trips/${tripId}/riders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Flexible Rider", assignmentMode: "any" })
    });
    assert.equal(anyCarResponse.status, 201);
    assert.equal((await anyCarResponse.json()).driverName, anyCarDriver.name);

    const fullAnyCarResponse = await fetch(`${baseUrl}/api/trips/${tripId}/riders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Late Rider", assignmentMode: "any" })
    });
    assert.equal(fullAnyCarResponse.status, 409);

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

    const oversizedResponse = await fetch(`${baseUrl}/api/admin/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "é".repeat(10_001) })
    });
    assert.equal(oversizedResponse.status, 413);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps the change log private while allowing trusted-group member corrections", async () => {
  const directory = await mkdtemp(join(tmpdir(), "temple-ride-server-members-"));
  const server = createAppServer({ dataFile: join(directory, "state.json"), adminPin: "1357" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const publicState = await (await fetch(`${baseUrl}/api/state`)).json();
    const trip = publicState.trips[0];
    assert.equal("changeLog" in trip, false);

    const driverResponse = await fetch(`${baseUrl}/api/trips/${trip.id}/drivers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Member Driver", seats: 2 })
    });
    assert.equal(driverResponse.status, 201);
    const driver = await driverResponse.json();

    const editResponse = await fetch(`${baseUrl}/api/trips/${trip.id}/people/${driver.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Motorist", seats: 3 })
    });
    assert.equal(editResponse.status, 200);

    const riderResponse = await fetch(`${baseUrl}/api/trips/${trip.id}/riders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Guarded Rider", driverId: driver.id })
    });
    assert.equal(riderResponse.status, 201);
    const rider = await riderResponse.json();

    const deniedMove = await fetch(`${baseUrl}/api/trips/${trip.id}/people/${rider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: rider.name, driverId: "", confirmationName: "Wrong Rider" })
    });
    assert.equal(deniedMove.status, 400);

    const confirmedMove = await fetch(`${baseUrl}/api/trips/${trip.id}/people/${rider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: rider.name, driverId: "", confirmationName: " guarded   rider " })
    });
    assert.equal(confirmedMove.status, 200);
    assert.equal((await confirmedMove.json()).placement, "waitlist");

    const anyCarMove = await fetch(`${baseUrl}/api/trips/${trip.id}/people/${rider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: rider.name, assignmentMode: "any", confirmationName: "Guarded Rider" })
    });
    assert.equal(anyCarMove.status, 200);
    assert.equal((await anyCarMove.json()).driverName, "Updated Motorist");

    const deniedLog = await fetch(`${baseUrl}/api/trips/${trip.id}/change-log`);
    assert.equal(deniedLog.status, 401);

    const allowedLog = await fetch(`${baseUrl}/api/trips/${trip.id}/change-log`, {
      headers: { "X-Admin-Pin": "1357" }
    });
    assert.equal(allowedLog.status, 200);
    const log = await allowedLog.json();
    assert.equal(log.entries[0].type, "rider_moved");
    assert.equal(log.entries[0].actor, "member");
    assert.equal(log.entries.some((entry) => entry.type === "driver_edited"), true);

    const removeResponse = await fetch(`${baseUrl}/api/trips/${trip.id}/people/${driver.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationName: "Wrong Name" })
    });
    assert.equal(removeResponse.status, 400);

    const confirmedRemoveResponse = await fetch(`${baseUrl}/api/trips/${trip.id}/people/${driver.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationName: "updated motorist" })
    });
    assert.equal(confirmedRemoveResponse.status, 200);

    const deniedTripEdit = await fetch(`${baseUrl}/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temple: "Newport Beach Temple", date: "2026-08-09", sessionTime: "18:00" })
    });
    assert.equal(deniedTripEdit.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test("returns structured current name matches before saving a signup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "temple-ride-server-matches-"));
  const server = createAppServer({ dataFile: join(directory, "state.json"), adminPin: "1357" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const state = await (await fetch(`${baseUrl}/api/state`)).json();
    const trip = state.trips[0];
    const driver = await (await fetch(`${baseUrl}/api/trips/${trip.id}/drivers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pat Smith", seats: 2 })
    })).json();

    const warningResponse = await fetch(`${baseUrl}/api/trips/${trip.id}/riders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alex Smith" })
    });
    assert.equal(warningResponse.status, 409);
    const warning = await warningResponse.json();
    assert.equal(warning.code, "NAME_MATCH_CONFIRMATION_REQUIRED");
    assert.equal(warning.matches[0].placement, "driver");
    assert.deepEqual(warning.eligibleCars, [{ id: driver.id, name: "Pat Smith", openSeats: 2 }]);

    const confirmedResponse = await fetch(`${baseUrl}/api/trips/${trip.id}/riders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alex Smith", driverId: driver.id, confirmedMatchIds: [driver.id] })
    });
    assert.equal(confirmedResponse.status, 201);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
