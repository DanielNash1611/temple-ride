import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { BlobStateBackend } from "./lib/blob-backend.js";
import { CarpoolStore, StoreError } from "./lib/store.js";

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

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20_000) throw new StoreError("Request is too large.", 413);
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new StoreError("Request must contain valid JSON.");
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
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });
    response.end(contents);
  } catch {
    throw new StoreError("Page not found.", 404);
  }
}

export function createAppHandler({
  dataFile = process.env.TEMPLE_CARPOOL_DATA_FILE || DEFAULT_DATA_FILE,
  adminPin = process.env.TEMPLE_CARPOOL_ADMIN_PIN || "2468",
  blobToken = process.env.BLOB_READ_WRITE_TOKEN,
  blobPathname = process.env.TEMPLE_CARPOOL_BLOB_PATH || "temple-ride/app-data.json"
} = {}) {
  const backend = blobToken ? new BlobStateBackend({ pathname: blobPathname, token: blobToken }) : undefined;
  const store = new CarpoolStore(dataFile, { backend });
  const usesDemoPin = !process.env.TEMPLE_CARPOOL_ADMIN_PIN && adminPin === "2468";

  return async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const segments = url.pathname.split("/").filter(Boolean);

      if (request.method === "GET" && url.pathname === "/api/state") {
        return sendJson(response, 200, await store.read());
      }

      if (request.method === "GET" && url.pathname === "/api/config") {
        return sendJson(response, 200, { demoAdminPin: usesDemoPin ? "2468" : null });
      }

      if (request.method === "POST" && url.pathname === "/api/admin/verify") {
        const body = await readJson(request);
        if (body.pin !== adminPin) throw new StoreError("The administrator PIN is incorrect.", 401);
        return sendJson(response, 200, { ok: true });
      }

      if (request.method === "POST" && url.pathname === "/api/trips") {
        requireAdmin(request, adminPin);
        return sendJson(response, 201, await store.createTrip(await readJson(request)));
      }

      if (segments[0] === "api" && segments[1] === "trips" && segments[2]) {
        const tripId = segments[2];

        if (request.method === "PATCH" && segments.length === 3) {
          requireAdmin(request, adminPin);
          return sendJson(response, 200, await store.updateTrip(tripId, await readJson(request)));
        }

        if (request.method === "DELETE" && segments.length === 3) {
          requireAdmin(request, adminPin);
          return sendJson(response, 200, await store.deleteTrip(tripId));
        }

        if (request.method === "POST" && segments[3] === "drivers") {
          return sendJson(response, 201, await store.addDriver(tripId, await readJson(request)));
        }

        if (request.method === "POST" && segments[3] === "riders") {
          return sendJson(response, 201, await store.addRider(tripId, await readJson(request)));
        }

        if (request.method === "DELETE" && segments[3] === "people" && segments[4]) {
          requireAdmin(request, adminPin);
          return sendJson(response, 200, await store.removePerson(tripId, segments[4]));
        }
      }

      if (request.method === "GET" || request.method === "HEAD") {
        return await serveStatic(url.pathname, response);
      }

      throw new StoreError("Not found.", 404);
    } catch (error) {
      const status = error instanceof StoreError ? error.status : 500;
      if (status === 500) console.error(error);
      sendJson(response, status, { error: status === 500 ? "Something went wrong." : error.message });
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
