import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CarpoolStore, StoreError, getOpenSeats } from "../lib/store.js";

async function withStore(run) {
  const directory = await mkdtemp(join(tmpdir(), "temple-ride-test-"));
  try {
    return await run(new CarpoolStore(join(directory, "state.json")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const tripInput = {
  temple: "Los Angeles Temple",
  date: "2026-08-08",
  sessionTime: "18:00",
  notes: "Meet by the north doors."
};

async function setCurrentTrip(store, input = tripInput) {
  const state = await store.read();
  return store.updateTrip(state.activeTripId, input);
}

test("keeps exactly one active trip that an admin can update or replace", () => withStore(async (store) => {
  const initialState = await store.read();
  await assert.rejects(store.createTrip(tripInput), /Edit the current trip/);

  const updated = await store.updateTrip(initialState.activeTripId, { ...tripInput, temple: "Newport Beach California Temple" });
  assert.equal(updated.temple, "Newport Beach California Temple");
  assert.equal(updated.title, "Newport Beach California Temple Trip");
  assert.equal("meetTime" in updated, false);
  assert.equal("meetingPlace" in updated, false);

  await store.deleteTrip(updated.id);
  const replacement = await store.createTrip(tripInput);
  const state = await store.read();
  assert.equal(state.activeTripId, replacement.id);
  assert.equal(state.trips.filter((trip) => trip.id === state.activeTripId).length, 1);
}));

test("adds a driver and fills only the offered passenger seats", () => withStore(async (store) => {
  const trip = await setCurrentTrip(store);
  const driver = await store.addDriver(trip.id, { name: "Pat Smith", seats: 2 });
  assert.equal(getOpenSeats(driver), 2);

  await store.addRider(trip.id, { name: "Taylor Reed", driverId: driver.id });
  await store.addRider(trip.id, { name: "Robin Lee", driverId: driver.id });

  await assert.rejects(
    store.addRider(trip.id, { name: "Chris Green", driverId: driver.id }),
    (error) => error instanceof StoreError && error.status === 409
  );
}));

test("adds unassigned riders to the rider list", () => withStore(async (store) => {
  const trip = await setCurrentTrip(store);
  const rider = await store.addRider(trip.id, { name: "Morgan Lane" });
  assert.equal(rider.placement, "waitlist");

  const state = await store.read();
  const savedTrip = state.trips.find((candidate) => candidate.id === trip.id);
  assert.equal(savedTrip.waitlist[0].name, "Morgan Lane");
}));

test("moves a driver's riders to the rider list when an admin removes the driver", () => withStore(async (store) => {
  const trip = await setCurrentTrip(store);
  const driver = await store.addDriver(trip.id, { name: "Sam Driver", seats: 1 });
  await store.addRider(trip.id, { name: "Alex Rider", driverId: driver.id });

  const result = await store.removePerson(trip.id, driver.id);
  assert.equal(result.movedToWaitlist, 1);

  const state = await store.read();
  const savedTrip = state.trips.find((candidate) => candidate.id === trip.id);
  assert.equal(savedTrip.drivers.length, 0);
  assert.equal(savedTrip.waitlist[0].name, "Alex Rider");
}));

test("rejects invalid names and seat counts", () => withStore(async (store) => {
  const trip = await setCurrentTrip(store);
  await assert.rejects(store.addDriver(trip.id, { name: "", seats: 3 }), /Name is required/);
  await assert.rejects(store.addDriver(trip.id, { name: "Pat", seats: 12 }), /between 1 and 8/);
}));
