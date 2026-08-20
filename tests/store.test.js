import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CarpoolStore, StoreError, getOpenSeats } from "../lib/store.js";

async function withStore(run, storeOptions) {
  const directory = await mkdtemp(join(tmpdir(), "temple-ride-test-"));
  try {
    return await run(new CarpoolStore(join(directory, "state.json"), storeOptions));
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

test("assigns Join any car across currently open passenger seats", () => {
  const randomValues = [0, 0.75];
  return withStore(async (store) => {
    const trip = await setCurrentTrip(store);
    const firstDriver = await store.addDriver(trip.id, { name: "Avery North", seats: 2 });
    const secondDriver = await store.addDriver(trip.id, { name: "Blair South", seats: 2 });

    const firstRider = await store.addRider(trip.id, { name: "Casey East", assignmentMode: "any" });
    const secondRider = await store.addRider(trip.id, { name: "Devon West", assignmentMode: "any" });
    assert.equal(firstRider.driverName, firstDriver.name);
    assert.equal(secondRider.driverName, secondDriver.name);

    await store.addRider(trip.id, { name: "Emery Lake", driverId: firstDriver.id });
    await store.addRider(trip.id, { name: "Finley Hill", driverId: secondDriver.id });
    await assert.rejects(
      store.addRider(trip.id, { name: "No Seat Rider", assignmentMode: "any" }),
      /There are no open seats right now/
    );
  }, { random: () => randomValues.shift() ?? 0 });
});

test("moves a waitlisted rider with confirmed Join any car", () => withStore(async (store) => {
  const trip = await setCurrentTrip(store);
  const driver = await store.addDriver(trip.id, { name: "Open Driver", seats: 1 });
  const rider = await store.addRider(trip.id, { name: "Waiting Rider" });

  await assert.rejects(
    store.updatePerson(trip.id, rider.id, {
      name: rider.name,
      assignmentMode: "any",
      confirmationName: "Wrong Rider"
    }),
    /Type Waiting Rider to confirm this change/
  );

  const moved = await store.updatePerson(trip.id, rider.id, {
    name: rider.name,
    assignmentMode: "any",
    confirmationName: " waiting   rider "
  });
  assert.equal(moved.driverName, driver.name);
  assert.equal(moved.placement, "car");
}));

test("moves a driver's riders to the rider list when an admin removes the driver", () => withStore(async (store) => {
  const trip = await setCurrentTrip(store);
  const driver = await store.addDriver(trip.id, { name: "Sam Driver", seats: 1 });
  await store.addRider(trip.id, { name: "Alex Rider", driverId: driver.id });

  const result = await store.removePerson(trip.id, driver.id, { confirmationName: "  sam   driver " });
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
  await assert.rejects(store.updateTrip(trip.id, { ...tripInput, date: "2026-02-31" }), /valid trip date/);
}));

test("requires explicit confirmation for exact-name and possible-family matches", () => withStore(async (store) => {
  const trip = await setCurrentTrip(store);
  const driver = await store.addDriver(trip.id, { name: "Pat Smith", seats: 2 });

  await assert.rejects(
    store.addRider(trip.id, { name: "Alex Smith" }),
    (error) => {
      assert.equal(error.details.code, "NAME_MATCH_CONFIRMATION_REQUIRED");
      assert.deepEqual(error.details.matches.map((match) => ({
        name: match.name,
        matchType: match.matchType,
        placement: match.placement,
        driverName: match.driverName
      })), [{ name: "Pat Smith", matchType: "family", placement: "driver", driverName: "Pat Smith" }]);
      assert.deepEqual(error.details.eligibleCars, [{ id: driver.id, name: "Pat Smith", openSeats: 2 }]);
      return true;
    }
  );

  const rider = await store.addRider(trip.id, {
    name: "  Alex   Smith ",
    confirmedMatchIds: [driver.id]
  });
  assert.equal(rider.name, "Alex Smith");

  await assert.rejects(
    store.addRider(trip.id, { name: "pat smith", driverId: driver.id }),
    (error) => {
      assert.equal(error.details.matches.find((match) => match.id === driver.id).matchType, "exact");
      assert.equal(error.details.matches.find((match) => match.id === rider.id).matchType, "family");
      return true;
    }
  );

  const secondDriver = await store.addDriver(trip.id, {
    name: "Jordan Smith",
    seats: 1,
    confirmedMatchIds: [driver.id, rider.id]
  });
  await assert.rejects(
    store.addRider(trip.id, { name: "Casey Smith" }),
    (error) => {
      assert.deepEqual(error.details.matches.map((match) => match.name), ["Pat Smith", "Jordan Smith", "Alex Smith"]);
      assert.deepEqual(error.details.eligibleCars.map((car) => car.id), [driver.id, secondDriver.id]);
      return true;
    }
  );
}));

test("lets members edit drivers and move riders while rechecking capacity", () => withStore(async (store) => {
  const trip = await setCurrentTrip(store);
  const firstDriver = await store.addDriver(trip.id, { name: "First Driver", seats: 2 });
  const rider = await store.addRider(trip.id, { name: "Moving Passenger", driverId: firstDriver.id });
  await store.addRider(trip.id, { name: "Staying Traveler", driverId: firstDriver.id });

  await assert.rejects(
    store.updatePerson(trip.id, firstDriver.id, { name: "First Driver", seats: 1 }),
    /already has 2 riders/
  );

  const secondDriver = await store.addDriver(trip.id, { name: "Second Motorist", seats: 1 });
  await store.addRider(trip.id, { name: "Full Car Occupant", driverId: secondDriver.id });
  await assert.rejects(
    store.updatePerson(trip.id, rider.id, {
      name: "Moving Passenger",
      driverId: secondDriver.id,
      confirmationName: "Moving Passenger"
    }),
    /just filled up/
  );

  await assert.rejects(
    store.updatePerson(trip.id, rider.id, {
      name: "Moving Passenger",
      driverId: "",
      confirmationName: "Wrong Passenger"
    }),
    /Type Moving Passenger to confirm this change/
  );

  const moved = await store.updatePerson(trip.id, rider.id, {
    name: "Renamed Rider",
    driverId: "",
    confirmationName: "  moving   passenger "
  });
  assert.equal(moved.placement, "waitlist");
  const editedDriver = await store.updatePerson(trip.id, firstDriver.id, { name: "Renamed Driver", seats: 1 });
  assert.equal(editedDriver.name, "Renamed Driver");
  assert.equal(editedDriver.seats, 1);
}));

test("requires the current display name before removing a roster entry", () => withStore(async (store) => {
  const trip = await setCurrentTrip(store);
  const rider = await store.addRider(trip.id, { name: "Careful Rider" });

  await assert.rejects(
    store.removePerson(trip.id, rider.id, { confirmationName: "Wrong Rider" }),
    /Type Careful Rider to confirm removal/
  );

  const stateAfterMismatch = await store.read();
  assert.equal(stateAfterMismatch.trips[0].waitlist[0].name, "Careful Rider");

  await store.removePerson(trip.id, rider.id, { confirmationName: "careful rider" });
  const stateAfterConfirmation = await store.read();
  assert.equal(stateAfterConfirmation.trips[0].waitlist.length, 0);
}));

test("records current-trip changes without claiming a member identity", () => withStore(async (store) => {
  const trip = await setCurrentTrip(store);
  const driver = await store.addDriver(trip.id, { name: "Log Driver", seats: 1 });
  const rider = await store.addRider(trip.id, { name: "Log Rider", driverId: driver.id });
  await store.updatePerson(trip.id, rider.id, {
    name: "Updated Rider",
    driverId: "",
    confirmationName: "Log Rider"
  });
  await store.removePerson(trip.id, rider.id, { confirmationName: "Updated Rider" });

  const log = await store.readChangeLog(trip.id);
  assert.deepEqual(log.slice(0, 4).map((entry) => entry.type), [
    "rider_removed",
    "rider_moved",
    "rider_added",
    "driver_added"
  ]);
  assert.equal(log[0].actor, "member");
  assert.equal("ipAddress" in log[0], false);
  assert.equal("userId" in log[0], false);
}));
