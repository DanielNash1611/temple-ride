import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const MAX_NAME_LENGTH = 80;

export class StoreError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "StoreError";
    this.status = status;
  }
}

function nextSaturday() {
  const date = new Date();
  const daysUntilSaturday = (6 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilSaturday);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function createInitialState() {
  const trip = {
    id: randomUUID(),
    title: "Los Angeles Temple Trip",
    temple: "Los Angeles Temple",
    date: nextSaturday(),
    sessionTime: "14:00",
    notes: "This is a sample trip. An administrator can edit it.",
    createdAt: new Date().toISOString(),
    drivers: [],
    waitlist: []
  };
  return {
    version: 2,
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T12:00:00`))) {
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
  if (state.version !== 2) {
    state.version = 2;
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
  }
  return { state, changed };
}

export function getOpenSeats(driver) {
  return Math.max(0, driver.seats - driver.riders.length);
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
  #queue = Promise.resolve();

  constructor(filePath, { backend } = {}) {
    this.#backend = backend ?? new FileStateBackend(filePath);
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
        waitlist: []
      };
      state.trips.push(trip);
      state.activeTripId = trip.id;
      return trip;
    });
  }

  updateTrip(tripId, input) {
    return this.#mutate((state) => {
      const trip = findActiveTrip(state, tripId);
      Object.assign(trip, cleanTrip(input));
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

  addDriver(tripId, input) {
    return this.#mutate((state) => {
      const trip = findActiveTrip(state, tripId);
      const seats = Number(input.seats);
      if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
        throw new StoreError("Choose between 1 and 8 available seats.");
      }
      const driver = {
        id: randomUUID(),
        name: cleanText(input.name, "Name", MAX_NAME_LENGTH),
        seats,
        riders: [],
        createdAt: new Date().toISOString()
      };
      trip.drivers.push(driver);
      return driver;
    });
  }

  addRider(tripId, input) {
    return this.#mutate((state) => {
      const trip = findActiveTrip(state, tripId);
      const rider = {
        id: randomUUID(),
        name: cleanText(input.name, "Name", MAX_NAME_LENGTH),
        createdAt: new Date().toISOString()
      };

      if (!input.driverId) {
        trip.waitlist.push(rider);
        return { ...rider, placement: "waitlist" };
      }

      const driver = trip.drivers.find((candidate) => candidate.id === input.driverId);
      if (!driver) throw new StoreError("That car is no longer available.", 404);
      if (getOpenSeats(driver) < 1) throw new StoreError("That car just filled up. Please choose another ride.", 409);
      driver.riders.push(rider);
      return { ...rider, placement: "car", driverName: driver.name };
    });
  }

  removePerson(tripId, personId) {
    return this.#mutate((state) => {
      const trip = findActiveTrip(state, tripId);
      const driverIndex = trip.drivers.findIndex((driver) => driver.id === personId);
      if (driverIndex >= 0) {
        const [driver] = trip.drivers.splice(driverIndex, 1);
        trip.waitlist.push(...driver.riders);
        return { ok: true, movedToWaitlist: driver.riders.length };
      }

      const waitlistIndex = trip.waitlist.findIndex((rider) => rider.id === personId);
      if (waitlistIndex >= 0) {
        trip.waitlist.splice(waitlistIndex, 1);
        return { ok: true, movedToWaitlist: 0 };
      }

      for (const driver of trip.drivers) {
        const riderIndex = driver.riders.findIndex((rider) => rider.id === personId);
        if (riderIndex >= 0) {
          driver.riders.splice(riderIndex, 1);
          return { ok: true, movedToWaitlist: 0 };
        }
      }

      throw new StoreError("That person could not be found.", 404);
    });
  }
}
