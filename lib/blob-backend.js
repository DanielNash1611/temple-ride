import { BlobPreconditionFailedError, get, put } from "@vercel/blob";

export class BlobStateBackend {
  #pathname;
  #token;
  #client;

  constructor({
    pathname = "temple-ride/app-data.json",
    token = process.env.BLOB_READ_WRITE_TOKEN,
    client = { get, put }
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
      const result = await this.#client.put(this.#pathname, `${JSON.stringify(state, null, 2)}\n`, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: Boolean(revision),
        cacheControlMaxAge: 60,
        contentType: "application/json",
        ...(revision ? { ifMatch: revision } : {}),
        ...this.#authOptions()
      });
      return result.etag;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError || error?.code === "BLOB_PRECONDITION_FAILED") {
        const conflict = new Error("The shared trip changed while it was being saved.");
        conflict.code = "STATE_CONFLICT";
        throw conflict;
      }
      throw error;
    }
  }
}
