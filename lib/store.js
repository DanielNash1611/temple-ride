import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const MAX_NAME_LENGTH = 80;

export class StoreError extends Error {
  constructor(message, status = 400, details = {}) {
    super(message);
    this.name = "StoreError";
    this.status = status;
    this.details = details;
  }
}

function createChange(type, displayName, description, actor = "member", timestamp = new Date().toISOString()) {
  return {
    id: randomUUID(),
    timestamp,
    type,
    displayName,
    description,
    actor: actor === "administrator" ? "administrator" : "member"
  };
}

function appendChange(trip, type, displayName, description, actor) {
  trip.changeLog.push(createChange(type, displayName, description, actor));
}

function nextSaturday() {
  const date = new Date();
  const daysUntilSaturday = (6 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilSaturday);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function createInitialState() {
  const createdAt = new Date().toISOString();
  const trip = {
    id: randomUUID(),
    title: "Los Angeles Temple Trip",
    temple: "Los Angeles Temple",
    date: nextSaturday(),
    sessionTime: "14:00",
    notes: "This is a sample trip. An administrator can edit it.",
    createdAt,
    drivers: [],
    waitlist: [],
    changeLog: []
  };
  appendChange(trip, "trip_created", trip.temple, `Trip created for ${trip.date} at ${trip.sessionTime}.`, "administrator");
  return {
    version: 3,
    activeTripId: trip.id,
    trips: [trip]
  };
}

function cleanText(value, label, maxLength = 120, required = true) {
  const result = String(value ?? "").trim().replace(/\s+/g, " ");
  if (required && !result) throw new StoreError(`${label} is required.`);
  if (result.length > maxLength) throw new StoreError(`${label} must be ${maxLength} characters or fewer.`);
  return result;
}

function cleanDate(value) {
  const result = cleanText(value, "Date", 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!match
    || date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() !== Number(match[2]) - 1
    || date.getUTCDate() !== Number(match[3])) {
    throw new StoreError("Enter a valid trip date.");
  }
  return result;
}

function cleanTime(value, label) {
  const result = cleanText(value, label, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) throw new StoreError(`Enter a valid ${label.toLowerCase()}.`);
  return result;
}

function cleanTrip(input) {
  const temple = cleanText(input.temple, "Temple", 100);
  return {
    title: `${temple} Trip`,
    temple,
    date: cleanDate(input.date),
    sessionTime: cleanTime(input.sessionTime, "Session time"),
    notes: cleanText(input.notes, "Notes", 240, false)
  };
}

function findTrip(state, tripId) {
  const trip = state.trips.find((candidate) => candidate.id === tripId);
  if (!trip) throw new StoreError("That trip could not be found.", 404);
  return trip;
}

function findActiveTrip(state, tripId) {
  if (!state.activeTripId || tripId !== state.activeTripId) {
    throw new StoreError("This trip is no longer active. Refresh to see the current trip.", 409);
  }
  return findTrip(state, tripId);
}

function actorFrom(context) {
  return context?.actor === "administrator" ? "administrator" : "member";
}

function normalizedName(name) {
  return name.toLocaleLowerCase("en-US");
}

function requirePersonConfirmation(person, input, action) {
  const confirmationName = cleanText(input?.confirmationName, "Confirmation name", MAX_NAME_LENGTH);
  if (normalizedName(confirmationName) !== normalizedName(person.name)) {
    throw new StoreError(`Type ${person.name} to confirm ${action}.`);
  }
}

function nameParts(name) {
  return normalizedName(name).split(" ");
}

function rosterPeople(trip) {
  return [
    ...trip.drivers.map((driver) => ({
      id: driver.id,
      name: driver.name,
      placement: "driver",
      driverId: driver.id,
      driverName: driver.name,
      openSeats: getOpenSeats(driver)
    })),
    ...trip.drivers.flatMap((driver) => driver.riders.map((rider) => ({
      id: rider.id,
      name: rider.name,
      placement: "car",
      driverId: driver.id,
      driverName: driver.name,
      openSeats: getOpenSeats(driver)
    }))),
    ...trip.waitlist.map((rider) => ({
      id: rider.id,
      name: rider.name,
      placement: "waitlist",
      driverId: null,
      driverName: null,
      openSeats: 0
    }))
  ];
}

function findNameMatches(trip, name, excludePersonId) {
  const normalized = normalizedName(name);
  const enteredParts = nameParts(name);

  return rosterPeople(trip)
    .filter((person) => person.id !== excludePersonId)
    .map((person) => {
      const existingParts = nameParts(person.name);
      const exact = normalizedName(person.name) === normalized;
      const family = !exact
        && enteredParts.length >= 2
        && existingParts.length >= 2
        && enteredParts.at(-1) === existingParts.at(-1);
      return exact || family ? { ...person, matchType: exact ? "exact" : "family" } : null;
    })
    .filter(Boolean);
}

function requireNameMatchConfirmation(trip, name, { excludePersonId, confirmedMatchIds } = {}) {
  const matches = findNameMatches(trip, name, excludePersonId);
  const confirmed = new Set(Array.isArray(confirmedMatchIds) ? confirmedMatchIds : []);
  if (matches.every((match) => confirmed.has(match.id))) return;

  const eligibleCars = [];
  const seenCars = new Set();
  for (const match of matches) {
    if (match.matchType !== "family" || !match.driverId || match.openSeats < 1 || seenCars.has(match.driverId)) continue;
    seenCars.add(match.driverId);
    eligibleCars.push({ id: match.driverId, name: match.driverName, openSeats: match.openSeats });
  }

  throw new StoreError(
    "Please review the possible duplicate or family-member signup before continuing.",
    409,
    { code: "NAME_MATCH_CONFIRMATION_REQUIRED", matches, eligibleCars }
  );
}

function driverDescription(driver) {
  return `${driver.name} driving with ${driver.seats} passenger ${driver.seats === 1 ? "seat" : "seats"}`;
}

function riderDescription(rider, driver) {
  return driver ? `${rider.name} riding with ${driver.name}` : `${rider.name} waiting for a seat`;
}

function normalizeState(state) {
  let changed = false;
  if (!Array.isArray(state.trips)) {
    state.trips = [];
    changed = true;
  }
  if (!state.activeTripId || !state.trips.some((trip) => trip.id === state.activeTripId)) {
    state.activeTripId = state.trips[0]?.id ?? null;
    changed = true;
  }
  if (state.version !== 3) {
    state.version = 3;
    changed = true;
  }
  for (const trip of state.trips) {
    const normalizedTitle = `${trip.temple} Trip`;
    if (trip.title !== normalizedTitle) {
      trip.title = normalizedTitle;
      changed = true;
    }
    if ("meetTime" in trip) {
      delete trip.meetTime;
      changed = true;
    }
    if ("meetingPlace" in trip) {
      delete trip.meetingPlace;
      changed = true;
    }
    if (!Array.isArray(trip.changeLog)) {
      trip.changeLog = [];
      changed = true;
    }
  }
  return { state, changed };
}

export function getOpenSeats(driver) {
  return Math.max(0, driver.seats - driver.riders.length);
}

function pickRandomOpenDriver(trip, random) {
  const openSeatCount = trip.drivers.reduce((total, driver) => total + getOpenSeats(driver), 0);
  if (openSeatCount < 1) {
    throw new StoreError("There are no open seats right now. Join the rider list instead.", 409);
  }
  let selectedSeat = Math.floor(random() * openSeatCount);
  return trip.drivers.find((driver) => {
    selectedSeat -= getOpenSeats(driver);
    return selectedSeat < 0;
  });
}

class FileStateBackend {
  #filePath;

  constructor(filePath) {
    this.#filePath = filePath;
  }

  async read() {
    try {
      return { state: JSON.parse(await readFile(this.#filePath, "utf8")), revision: null };
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async write(state) {
    await mkdir(dirname(this.#filePath), { recursive: true });
    const temporaryPath = `${this.#filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.#filePath);
    return null;
  }
}

export class CarpoolStore {
  #backend;
  #random;
  #queue = Promise.resolve();

  constructor(filePath, { backend, random = Math.random } = {}) {
    this.#backend = backend ?? new FileStateBackend(filePath);
    this.#random = random;
  }

  async #loadSnapshot() {
    const existing = await this.#backend.read();
    if (existing) return existing;

    const initialState = createInitialState();
    try {
      const revision = await this.#backend.write(initialState, null);
      return { state: initialState, revision };
    } catch (error) {
      if (error.code !== "STATE_CONFLICT") throw error;
      const createdElsewhere = await this.#backend.read();
      if (createdElsewhere) return createdElsewhere;
      throw error;
    }
  }

  async read() {
    const snapshot = await this.#loadSnapshot();
    const normalized = normalizeState(snapshot.state);
    if (normalized.changed) {
      try {
        await this.#backend.write(normalized.state, snapshot.revision);
      } catch (error) {
        if (error.code !== "STATE_CONFLICT") throw error;
        return (await this.#loadSnapshot()).state;
      }
    }
    return normalized.state;
  }

  async #mutateWithRetry(mutator) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const snapshot = await this.#loadSnapshot();
      const state = normalizeState(snapshot.state).state;
      const result = await mutator(state);

      try {
        await this.#backend.write(state, snapshot.revision);
        return result ?? state;
      } catch (error) {
        if (error.code !== "STATE_CONFLICT") throw error;
      }
    }

    throw new StoreError("Another signup changed at the same time. Please try again.", 409);
  }

  async #mutate(mutator) {
    const operation = this.#queue.then(() => this.#mutateWithRetry(mutator));
    this.#queue = operation.catch(() => undefined);
    return operation;
  }

  createTrip(input) {
    return this.#mutate((state) => {
      if (state.activeTripId) throw new StoreError("Edit the current trip before adding another one.", 409);
      const trip = {
        id: randomUUID(),
        ...cleanTrip(input),
        createdAt: new Date().toISOString(),
        drivers: [],
        waitlist: [],
        changeLog: []
      };
      appendChange(trip, "trip_created", trip.temple, `Trip created for ${trip.date} at ${trip.sessionTime}.`, "administrator");
      state.trips.push(trip);
      state.activeTripId = trip.id;
      return trip;
    });
  }

  updateTrip(tripId, input) {
    return this.#mutate((state) => {
      const trip = findActiveTrip(state, tripId);
      const before = `${trip.temple} on ${trip.date} at ${trip.sessionTime}${trip.notes ? ` — ${trip.notes}` : ""}`;
      const cleaned = cleanTrip(input);
      Object.assign(trip, cleaned);
      const after = `${trip.temple} on ${trip.date} at ${trip.sessionTime}${trip.notes ? ` — ${trip.notes}` : ""}`;
      appendChange(trip, "trip_updated", trip.temple, `Trip changed from ${before} to ${after}.`, "administrator");
      return trip;
    });
  }

  deleteTrip(tripId) {
    return this.#mutate((state) => {
      findActiveTrip(state, tripId);
      const index = state.trips.findIndex((trip) => trip.id === tripId);
      state.trips.splice(index, 1);
      state.activeTripId = null;
      return { ok: true };
    });
  }

  addDriver(tripId, input, context = {}) {
    return this.#mutate((state) => {
      const trip = findActiveTrip(state, tripId);
      const seats = Number(input.seats);
      if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
        throw new StoreError("Choose between 1 and 8 available seats.");
      }
      const name = cleanText(input.name, "Name", MAX_NAME_LENGTH);
      requireNameMatchConfirmation(trip, name, { confirmedMatchIds: input.confirmedMatchIds });
      const driver = {
        id: randomUUID(),
        name,
        seats,
        riders: [],
        createdAt: new Date().toISOString()
      };
      trip.drivers.push(driver);
      appendChange(trip, "driver_added", driver.name, `${driverDescription(driver)} added.`, actorFrom(context));
      return driver;
    });
  }

  addRider(tripId, input, context = {}) {
    return this.#mutate((state) => {
      const trip = findActiveTrip(state, tripId);
      const name = cleanText(input.name, "Name", MAX_NAME_LENGTH);
      requireNameMatchConfirmation(trip, name, { confirmedMatchIds: input.confirmedMatchIds });
      const assignmentMode = cleanText(input.assignmentMode, "Assignment mode", 20, false);
      if (assignmentMode && assignmentMode !== "any") throw new StoreError("Choose a valid ride option.");
      if (assignmentMode === "any" && input.driverId) throw new StoreError("Choose either a specific car or any car.");
      const rider = {
        id: randomUUID(),
        name,
        createdAt: new Date().toISOString()
      };

      if (assignmentMode === "any") {
        const driver = pickRandomOpenDriver(trip, this.#random);
        driver.riders.push(rider);
        appendChange(trip, "rider_added", rider.name, `${riderDescription(rider, driver)} after choosing any open car.`, actorFrom(context));
        return { ...rider, placement: "car", driverName: driver.name };
      }

      if (!input.driverId) {
        trip.waitlist.push(rider);
        appendChange(trip, "rider_added", rider.name, `${riderDescription(rider)}.`, actorFrom(context));
        return { ...rider, placement: "waitlist" };
      }

      const driver = trip.drivers.find((candidate) => candidate.id === input.driverId);
      if (!driver) throw new StoreError("That car is no longer available.", 404);
      if (getOpenSeats(driver) < 1) throw new StoreError("That car just filled up. Please choose another ride.", 409);
      driver.riders.push(rider);
      appendChange(trip, "rider_added", rider.name, `${riderDescription(rider, driver)}.`, actorFrom(context));
      return { ...rider, placement: "car", driverName: driver.name };
    });
  }

  updatePerson(tripId, personId, input, context = {}) {
    return this.#mutate((state) => {
      const trip = findActiveTrip(state, tripId);
      const name = cleanText(input.name, "Name", MAX_NAME_LENGTH);
      requireNameMatchConfirmation(trip, name, {
        excludePersonId: personId,
        confirmedMatchIds: input.confirmedMatchIds
      });

      const driver = trip.drivers.find((candidate) => candidate.id === personId);
      if (driver) {
        const seats = Number(input.seats);
        if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
          throw new StoreError("Choose between 1 and 8 available seats.");
        }
        if (seats < driver.riders.length) {
          throw new StoreError(`This car already has ${driver.riders.length} ${driver.riders.length === 1 ? "rider" : "riders"}. Offer at least that many passenger seats.`, 409);
        }
        const before = driverDescription(driver);
        driver.name = name;
        driver.seats = seats;
        appendChange(trip, "driver_edited", driver.name, `${before} changed to ${driverDescription(driver)}.`, actorFrom(context));
        return { ...driver, personType: "driver" };
      }

      let rider = null;
      let currentDriver = null;
      let riderIndex = trip.waitlist.findIndex((candidate) => candidate.id === personId);
      if (riderIndex >= 0) {
        rider = trip.waitlist[riderIndex];
      } else {
        currentDriver = trip.drivers.find((candidate) => candidate.riders.some((candidateRider) => candidateRider.id === personId)) || null;
        riderIndex = currentDriver?.riders.findIndex((candidate) => candidate.id === personId) ?? -1;
        if (riderIndex >= 0) rider = currentDriver.riders[riderIndex];
      }
      if (!rider) throw new StoreError("That person could not be found.", 404);
      requirePersonConfirmation(rider, input, "this change");

      const assignmentMode = cleanText(input.assignmentMode, "Assignment mode", 20, false);
      if (assignmentMode && assignmentMode !== "any") throw new StoreError("Choose a valid ride option.");
      if (assignmentMode === "any" && input.driverId) throw new StoreError("Choose either a specific car or any car.");

      const destinationDriver = assignmentMode === "any"
        ? pickRandomOpenDriver(trip, this.#random)
        : input.driverId
          ? trip.drivers.find((candidate) => candidate.id === input.driverId)
          : null;
      if (input.driverId && !destinationDriver) throw new StoreError("That car is no longer available.", 404);
      if (destinationDriver && destinationDriver.id !== currentDriver?.id && getOpenSeats(destinationDriver) < 1) {
        throw new StoreError("That car just filled up. Please choose another ride.", 409);
      }

      const before = riderDescription(rider, currentDriver);
      if (currentDriver) currentDriver.riders.splice(riderIndex, 1);
      else trip.waitlist.splice(riderIndex, 1);
      rider.name = name;
      if (destinationDriver) destinationDriver.riders.push(rider);
      else trip.waitlist.push(rider);
      const after = riderDescription(rider, destinationDriver);
      const moved = currentDriver?.id !== destinationDriver?.id;
      appendChange(trip, moved ? "rider_moved" : "rider_edited", rider.name, `${before} changed to ${after}.`, actorFrom(context));
      return {
        ...rider,
        personType: "rider",
        placement: destinationDriver ? "car" : "waitlist",
        driverName: destinationDriver?.name ?? null
      };
    });
  }

  removePerson(tripId, personId, input = {}, context = {}) {
    return this.#mutate((state) => {
      const trip = findActiveTrip(state, tripId);
      const driverIndex = trip.drivers.findIndex((driver) => driver.id === personId);
      if (driverIndex >= 0) {
        requirePersonConfirmation(trip.drivers[driverIndex], input, "removal");
        const [driver] = trip.drivers.splice(driverIndex, 1);
        trip.waitlist.push(...driver.riders);
        appendChange(
          trip,
          "driver_removed",
          driver.name,
          `${driver.name} removed; ${driver.riders.length} ${driver.riders.length === 1 ? "rider was" : "riders were"} moved to the rider list.`,
          actorFrom(context)
        );
        return { ok: true, movedToWaitlist: driver.riders.length };
      }

      const waitlistIndex = trip.waitlist.findIndex((rider) => rider.id === personId);
      if (waitlistIndex >= 0) {
        requirePersonConfirmation(trip.waitlist[waitlistIndex], input, "removal");
        const [rider] = trip.waitlist.splice(waitlistIndex, 1);
        appendChange(trip, "rider_removed", rider.name, `${rider.name} removed from the rider list.`, actorFrom(context));
        return { ok: true, movedToWaitlist: 0 };
      }

      for (const driver of trip.drivers) {
        const riderIndex = driver.riders.findIndex((rider) => rider.id === personId);
        if (riderIndex >= 0) {
          requirePersonConfirmation(driver.riders[riderIndex], input, "removal");
          const [rider] = driver.riders.splice(riderIndex, 1);
          appendChange(trip, "rider_removed", rider.name, `${rider.name} removed from ${driver.name}’s car.`, actorFrom(context));
          return { ok: true, movedToWaitlist: 0 };
        }
      }

      throw new StoreError("That person could not be found.", 404);
    });
  }

  async readChangeLog(tripId) {
    const state = await this.read();
    const trip = findActiveTrip(state, tripId);
    return [...trip.changeLog].reverse();
  }
}
