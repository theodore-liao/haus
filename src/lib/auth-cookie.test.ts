import { test } from "node:test";
import assert from "node:assert/strict";
import { requestIsHttps } from "./auth";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const before = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(values)) {
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    run();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("a sign-in over the home network over plain HTTP gets a cookie the browser will keep", () => {
  withEnv({ HAUS_HTTPS: undefined, HAUS_PUBLIC_URL: undefined }, () => {
    assert.equal(requestIsHttps(new Request("http://10.0.0.172:3000/api/auth/login")), false);
  });
});

test("an HTTPS request, direct or behind a proxy, gets an HTTPS-only cookie", () => {
  withEnv({ HAUS_HTTPS: undefined, HAUS_PUBLIC_URL: undefined }, () => {
    assert.equal(requestIsHttps(new Request("https://haus.example/api/auth/login")), true);
    const proxied = new Request("http://127.0.0.1:3000/api/auth/login", { headers: { "x-forwarded-proto": "https" } });
    assert.equal(requestIsHttps(proxied), true);
  });
});

test("a site set up as HTTPS-only always marks the cookie HTTPS-only", () => {
  withEnv({ HAUS_HTTPS: undefined, HAUS_PUBLIC_URL: "https://haus.example" }, () => {
    assert.equal(requestIsHttps(new Request("http://10.0.0.172:3000/api/auth/login")), true);
  });
});
