/** Shared test helpers for BuildBanner client tests. */

/** Create a mock Response object for fetch stubbing. */
export function mockResponse(body, { status = 200, contentType = "application/json" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => (name.toLowerCase() === "content-type" ? contentType : null),
    },
    json: () => Promise.resolve(body),
  };
}
