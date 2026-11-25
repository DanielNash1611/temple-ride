import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BlobStateBackend } from "./lib/blob-backend.js";
import { CarpoolStore, StoreError } from "./lib/store.js";
import { WeekStore, publishedRoster, eventSummary } from "./lib/week-store.js";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT_DIR, "public");
const DEFAULT_DATA_FILE = join(ROOT_DIR, "data", "app-data.json");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function memberState({ supportRequests, savedEvents, ...state }) {
  return {
    ...state,
    trips: state.trips.map(({ changeLog, ...trip }) => trip)
  };
}

async function readJson(request) {
  let body = "";
  let bodyBytes = 0;
  for await (const chunk of request) {
    bodyBytes += Buffer.byteLength(chunk);
    if (bodyBytes > 20_000) throw new StoreError("Request is too large.", 413);
    body += chunk;
  }
  try {
    const value = body ? JSON.parse(body) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
    return value;
  } catch {
    throw new StoreError("Request must contain a valid JSON object.");
  }
}

function isAdmin(request, adminPin) {
  return request.headers["x-admin-pin"] === adminPin;
}

function requireAdmin(request, adminPin) {
  if (!isAdmin(request, adminPin)) throw new StoreError("The administrator PIN is incorrect.", 401);
}

async function serveStatic(requestPath, response) {
  const requestedFile = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const safePath = normalize(requestedFile).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) throw new StoreError("Not found.", 404);

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) throw new Error("Not a file");
    const contents = await readFile(filePath);
    const extension = extname(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] ?? "application/octet-stream",
      "Cache-Control": [".html", ".css", ".js"].includes(extension) ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });
    response.end(contents);
  } catch {
    throw new StoreError("Page not found.", 404);
  }
}

export function createAppHandler({
  experiment = false,
  dataFile = experiment ? join(ROOT_DIR, "data", "temple-week-experiment.json") : process.env.TEMPLE_CARPOOL_DATA_FILE || DEFAULT_DATA_FILE,
  adminPin = process.env.TEMPLE_CARPOOL_ADMIN_PIN || "2468",
  blobToken = process.env.BLOB_READ_WRITE_TOKEN,
  blobPathname = process.env.TEMPLE_CARPOOL_BLOB_PATH || "temple-ride/app-data.json"
} = {}) {
  if (experiment && resolve(dataFile) === resolve(DEFAULT_DATA_FILE)) throw new Error("The experiment cannot use the pilot data file.");
  const backend = !experiment && blobToken ? new BlobStateBackend({ pathname: blobPathname, token: blobToken }) : undefined;
  const store = experiment ? new WeekStore(dataFile) : new CarpoolStore(dataFile, { backend });
  const usesDemoPin = !process.env.TEMPLE_CARPOOL_ADMIN_PIN && adminPin === "2468";

  return async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const segments = url.pathname.split("/").filter(Boolean);

      if (request.method === "GET" && url.pathname === "/api/state") {
        const state = await store.read();
        return sendJson(response, 200, memberState(experiment ? publishedRoster(state) : state));
      }

      if (request.method === "GET" && url.pathname === "/api/config") {
        return sendJson(response, 200, { demoAdminPin: usesDemoPin ? "2468" : null, ...(experiment ? { mode: "temple-week" } : {}) });
      }

      if (request.method === "POST" && url.pathname === "/api/admin/verify") {
        const body = await readJson(request);
        if (body.pin !== adminPin) throw new StoreError("The administrator PIN is incorrect.", 401);
        return sendJson(response, 200, { ok: true });
      }

      if (experiment && url.pathname === '/api/admin/week-state' && request.method === 'GET') {
        requireAdmin(request, adminPin);
        const state = await store.read();
        return sendJson(response, 200, {...memberState(state), events:(state.savedEvents || []).map(eventSummary)});
      }
      if (experiment && segments.slice(0, 3).join('/') === 'api/admin/events') {
        requireAdmin(request, adminPin);
        const [, , , id, action] = segments;
        if (!id && request.method === 'POST') return sendJson(response, 201, await store.saveDraft(await readJson(request)));
        if (segments.length === 4 && request.method === 'PATCH') return sendJson(response, 200, await store.saveDraft(await readJson(request), id));
        if (segments.length === 5 && action === 'preview' && request.method === 'GET') return sendJson(response, 200, memberState(await store.previewEvent(id)));
        if (segments.length === 5 && action === 'activate' && request.method === 'POST') return sendJson(response, 200, await store.changeActiveEvent(id, await readJson(request)));
        if (segments.length === 4 && id === 'end' && request.method === 'POST') return sendJson(response, 200, await store.changeActiveEvent(null, await readJson(request)));
        throw new StoreError('Unknown event action.', 404);
      }
      if (experiment && url.pathname === '/api/week/member-view' && request.method === 'PATCH') {
        requireAdmin(request, adminPin);
        return sendJson(response,200,await store.setMemberView(await readJson(request)));
      }

      if (experiment && url.pathname === '/api/week/support') {
        if (request.method === 'POST') {
          await store.requestSupport(await readJson(request));
          return sendJson(response, 201, {ok:true});
        }
        requireAdmin(request, adminPin);
        if (request.method === 'GET') {
          const state = await store.read();
          return sendJson(response, 200, {weekId:state.week?.id, requests:state.supportRequests || []});
        }
        if (request.method === 'PATCH') {
          return sendJson(response, 200, await store.completeSupport(await readJson(request)));
        }
      }
      if (experiment && url.pathname === "/api/week" && ["POST", "PATCH", "DELETE"].includes(request.method)) {
        requireAdmin(request, adminPin);
        const body = await readJson(request);
        return sendJson(response, 200, request.method === "DELETE" ? await store.deleteWeek(body) : await store.saveWeek(body));
      }

      if (experiment && request.method === 'POST' && segments.length === 4 && segments[0] === 'api' && segments[1] === 'week' && segments[2] === 'match') {
        return sendJson(response,200,await store.matchRide(segments[3],await readJson(request),{actor:isAdmin(request,adminPin)?'administrator':'member'}));
      }

      if (experiment && url.pathname === "/api/week/plans" && request.method === "POST") {
        return sendJson(response, 201, await store.addPlan(await readJson(request), { actor: isAdmin(request, adminPin) ? "administrator" : "member" }));
      }

      if (experiment && segments[0] === 'api' && segments[1] === 'week' && segments[2] === 'availability') {
        const context = { actor: isAdmin(request, adminPin) ? 'administrator' : 'member' };
        if (request.method === 'POST' && segments.length === 3) return sendJson(response, 201, await store.saveAvailability(await readJson(request), context));
        if (request.method === 'PATCH' && segments.length === 4) return sendJson(response, 200, await store.saveAvailability(await readJson(request), context, segments[3]));
        if (request.method === 'DELETE' && segments.length === 4) return sendJson(response, 200, await store.removeAvailability(segments[3], await readJson(request), context));
      }

      if (experiment && request.method === 'POST' && segments[0] === 'api' && segments[1] === 'week' && segments[2] === 'availability' && segments[4] === 'riders' && segments[5] && segments.length === 6) {
        return sendJson(response,200,await store.decideFlexibleRide(segments[3],segments[5],await readJson(request),{actor:isAdmin(request,adminPin)?'administrator':'member'}));
      }
      if (experiment && request.method === 'POST' && segments[0] === 'api' && segments[1] === 'trips' && segments[3] === 'drivers' && segments[5] === 'riders' && segments[6] && segments.length === 7) {
        return sendJson(response,200,await store.decideSessionRide(segments[2],segments[4],segments[6],await readJson(request),{actor:isAdmin(request,adminPin)?'administrator':'member'}));
      }

      if (request.method === "POST" && url.pathname === "/api/trips") {
        requireAdmin(request, adminPin);
        const trip = await store.createTrip(await readJson(request));
        if (experiment) {
          const { changeLog, ...session } = trip;
          return sendJson(response, 201, session);
        }
        return sendJson(response, 201, trip);
      }

      if (segments[0] === "api" && segments[1] === "trips" && segments[2]) {
        const tripId = segments[2];

        if (request.method === "GET" && segments[3] === "change-log" && segments.length === 4) {
          requireAdmin(request, adminPin);
          return sendJson(response, 200, { entries: await store.readChangeLog(tripId) });
        }

        if (request.method === "PATCH" && segments.length === 3) {
          requireAdmin(request, adminPin);
          return sendJson(response, 200, await store.updateTrip(tripId, await readJson(request)));
        }

        if (request.method === "DELETE" && segments.length === 3) {
          requireAdmin(request, adminPin);
          return sendJson(response, 200, await store.deleteTrip(tripId, experiment ? await readJson(request) : undefined));
        }

        if (request.method === "POST" && segments[3] === "drivers") {
          return sendJson(response, 201, await store.addDriver(
            tripId,
            await readJson(request),
            { actor: isAdmin(request, adminPin) ? "administrator" : "member" }
          ));
        }

        if (request.method === "POST" && segments[3] === "riders") {
          return sendJson(response, 201, await store.addRider(
            tripId,
            await readJson(request),
            { actor: isAdmin(request, adminPin) ? "administrator" : "member" }
          ));
        }

        if (request.method === "PATCH" && segments[3] === "people" && segments[4] && segments.length === 5) {
          return sendJson(response, 200, await store.updatePerson(
            tripId,
            segments[4],
            await readJson(request),
            { actor: isAdmin(request, adminPin) ? "administrator" : "member" }
          ));
        }

        if (request.method === "DELETE" && segments[3] === "people" && segments[4] && segments.length === 5) {
          return sendJson(response, 200, await store.removePerson(
            tripId,
            segments[4],
            await readJson(request),
            { actor: isAdmin(request, adminPin) ? "administrator" : "member" }
          ));
        }
      }

      if (request.method === "GET" || request.method === "HEAD") {
        if (!experiment && url.pathname.startsWith("/week/")) throw new StoreError("Not found.", 404);
        return await serveStatic(experiment && url.pathname === "/" ? "/week/index.html" : url.pathname, response);
      }

      throw new StoreError("Not found.", 404);
    } catch (error) {
      const status = error instanceof StoreError ? error.status : 500;
      if (status === 500) console.error(error);
      sendJson(response, status, {
        error: status === 500 ? "Something went wrong." : error.message,
        ...(error instanceof StoreError ? error.details : {})
      });
    }
  };
}

export function createAppServer(options = {}) {
  return createServer(createAppHandler(options));
}

export default createAppHandler();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "0.0.0.0";
  const server = createAppServer();
  server.listen(port, host, () => {
    console.log(`Temple Ride is ready at http://localhost:${port}`);
    if (!process.env.TEMPLE_CARPOOL_ADMIN_PIN) {
      console.log("Demo admin PIN: 2468 (set TEMPLE_CARPOOL_ADMIN_PIN before sharing the app)");
    }
  });
}
