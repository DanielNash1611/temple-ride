import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  head,
  put
} from "@vercel/blob";

function normalizedEtag(value) {
  return String(value ?? "").trim().replace(/^W\//, "");
}

function stateConflict() {
  const conflict = new Error("The shared trip changed while it was being saved.");
  conflict.code = "STATE_CONFLICT";
  return conflict;
}

export class BlobStateBackend {
  #pathname;
  #token;
  #client;

  constructor({
    pathname = "temple-ride/app-data.json",
    token = process.env.BLOB_READ_WRITE_TOKEN,
    client = { get, head, put }
  } = {}) {
    this.#pathname = pathname;
    this.#token = token;
    this.#client = client;
  }

  #authOptions() {
    return this.#token ? { token: this.#token } : {};
  }

  async read() {
    const result = await this.#client.get(this.#pathname, {
      access: "private",
      useCache: false,
      ...this.#authOptions()
    });
    if (!result) return null;

    return {
      state: JSON.parse(await new Response(result.stream).text()),
      revision: result.blob.etag
    };
  }

  async write(state, revision) {
    try {
      let writeRevision = revision;
      if (revision) {
        const metadata = await this.#client.head(this.#pathname, this.#authOptions());
        if (!normalizedEtag(metadata.etag)
          || normalizedEtag(metadata.etag) !== normalizedEtag(revision)) {
          throw stateConflict();
        }
        writeRevision = metadata.etag;
      }

      const result = await this.#client.put(this.#pathname, `${JSON.stringify(state, null, 2)}\n`, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: Boolean(writeRevision),
        cacheControlMaxAge: 60,
        contentType: "application/json",
        ...(writeRevision ? { ifMatch: writeRevision } : {}),
        ...this.#authOptions()
      });
      return result.etag;
    } catch (error) {
      if (error instanceof BlobNotFoundError
        || error instanceof BlobPreconditionFailedError
        || error?.code === "BLOB_PRECONDITION_FAILED") {
        throw stateConflict();
      }
      throw error;
    }
  }
}
