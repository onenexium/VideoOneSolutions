import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const require = createRequire(import.meta.url);
const { enhanceMiddleware } = require("../scripts/dev-media-middleware.js");

const dir = mkdtempSync(path.join(tmpdir(), "dev-media-test-"));
const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
writeFileSync(path.join(dir, "clip.mp4"), bytes);
writeFileSync(path.join(dir, "secret.txt"), "not a video");

// A stand-in for Metro: anything not under /dev-media/ must reach it unchanged.
const metro = (req, res) => {
  res.statusCode = 200;
  res.end("metro:" + req.url);
};
const server = http.createServer((req, res) =>
  enhanceMiddleware(dir)(metro)(req, res, () => {}),
);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

const get = async (urlPath, headers = {}, method = "GET") => {
  const response = await fetch(base + urlPath, { headers, method });
  return { response, body: Buffer.from(await response.arrayBuffer()) };
};

test("serves a whole file with its length and advertises range support", async () => {
  const { response, body } = await get("/dev-media/clip.mp4");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("content-length"), "1000");
  assert.deepEqual(body, bytes);
});

test("a byte range returns exactly those bytes with 206 and Content-Range", async () => {
  const { response, body } = await get("/dev-media/clip.mp4", { range: "bytes=100-199" });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 100-199/1000");
  assert.equal(response.headers.get("content-length"), "100");
  assert.deepEqual(body, bytes.subarray(100, 200));
});

test("open-ended and suffix ranges work, and an end past the file is clamped", async () => {
  const open = await get("/dev-media/clip.mp4", { range: "bytes=900-" });
  assert.equal(open.response.status, 206);
  assert.deepEqual(open.body, bytes.subarray(900));

  const suffix = await get("/dev-media/clip.mp4", { range: "bytes=-50" });
  assert.equal(suffix.response.headers.get("content-range"), "bytes 950-999/1000");
  assert.deepEqual(suffix.body, bytes.subarray(950));

  const clamped = await get("/dev-media/clip.mp4", { range: "bytes=990-5000" });
  assert.equal(clamped.response.headers.get("content-range"), "bytes 990-999/1000");
  assert.deepEqual(clamped.body, bytes.subarray(990));
});

test("unsatisfiable or malformed ranges answer 416, not data", async () => {
  for (const range of ["bytes=1000-", "bytes=2000-3000", "bytes=500-100", "bytes=-", "nonsense"]) {
    const { response, body } = await get("/dev-media/clip.mp4", { range });
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get("content-range"), "bytes */1000", range);
    assert.equal(body.length, 0, range);
  }
});

test("HEAD returns the headers and no body", async () => {
  const { response, body } = await get("/dev-media/clip.mp4", {}, "HEAD");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-length"), "1000");
  assert.equal(body.length, 0);
});

// fetch() normalises "/../" away before sending, so use a raw request to send the path as is.
const rawGet = (urlPath) =>
  new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: server.address().port, path: urlPath }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }),
        );
      })
      .on("error", reject);
  });

test("it cannot be used to read files outside the folder or non-video files", async () => {
  for (const urlPath of [
    "/dev-media/..%2F..%2Fpackage.json",
    "/dev-media/../package.json",
    "/dev-media/..\..\package.json",
    "/dev-media/%2e%2e/package.json",
    "/dev-media/secret.txt",
    "/dev-media/missing.mp4",
    "/dev-media/",
  ]) {
    const { status, body } = await rawGet(urlPath);
    assert.ok([400, 404].includes(status), `${urlPath} -> ${status}`);
    assert.doesNotMatch(body, /not a video|"name"/, urlPath);
  }
});

test("everything else is left to Metro untouched", async () => {
  const { response, body } = await get("/index.bundle?platform=android");
  assert.equal(response.status, 200);
  assert.equal(body.toString(), "metro:/index.bundle?platform=android");

  const post = await fetch(base + "/dev-media/clip.mp4", { method: "POST" });
  assert.equal(await post.text(), "metro:/dev-media/clip.mp4", "only GET and HEAD are served here");
});
