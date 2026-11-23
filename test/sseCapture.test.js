import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

class FakeWebSocket {
  addEventListener() {}
  send() {}
  close() {}
}
class FakeEventSource extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  constructor(url) { super(); this.url = url; this.readyState = 0; }
  close() { this.readyState = 2; }
}
async function harness(fetchImpl, clock = Date) {
  const events = [], callbacks = [], listeners = new Map();
  const win = { WebSocket: FakeWebSocket, EventSource: FakeEventSource, fetch: fetchImpl,
    location: { href: "https://example.test/" }, addEventListener(type, callback) { listeners.set(type, callback); },
    postMessage(value) { if (value.type === "websocket-event-batch") events.push(...value.payload); },
  };
  win.top = win;
  const context = vm.createContext({ window: win, URL, Date: clock, Math, Map, Set, JSON, Reflect,
    ArrayBuffer, Uint8Array, TextDecoder, ReadableStream, Response, Blob, DOMException, console, atob, btoa,
    history: { pushState() {}, replaceState() {} },
    setTimeout(fn, delay) { if (delay <= 70) callbacks.push(fn); return callbacks.length; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
  });
  vm.runInContext(await readFile(new URL("../src/content/injected.js", import.meta.url), "utf8"), context);
  return { win, events, listeners, flush() { while (callbacks.length) callbacks.shift()(); } };
}

test("SSE fetch parses UTF-8 and SSE records incrementally while preserving ordinary responses", async () => {
  const bytes = new TextEncoder().encode('id: 9\r\nevent: delta\r\ndata: 中文\r\ndata: next\r\n\r\ndata: [DONE]\n\ndata: incomplete');
  const ordinary = new Response("ordinary", { headers: { "content-type": "text/plain" } });
  let argumentsSeen;
  const h = await harness((...args) => {
    argumentsSeen = args;
    if (args[0] === "ordinary") return Promise.resolve(ordinary);
    return Promise.resolve(new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); } }), { headers: { "content-type": "text/event-stream; charset=utf-8" } }));
  });
  assert.equal(await h.win.fetch("ordinary"), ordinary);
  const init = { method: "POST", credentials: "include" };
  const result = await h.win.fetch("stream", init);
  assert.equal(argumentsSeen[1], init);
  assert.equal(await result.text(), new TextDecoder().decode(bytes));
  h.flush();
  const messages = h.events.filter(event => event.type === "message");
  assert.deepEqual(messages.map(e => [e.data, e.eventName, e.lastEventId]), [["中文\nnext", "delta", "9"], ["[DONE]", "message", "9"]]);
  assert.notEqual(messages[0].messageId, messages[1].messageId);
});

test("application cancellation reaches source and unread response is not consumed by observer", async () => {
  let pulls = 0, cancelled = 0;
  const source = new ReadableStream({ pull(c) { pulls++; c.enqueue(Uint8Array.of(1)); }, cancel() { cancelled++; } }, { highWaterMark: 0 });
  const h = await harness(() => Promise.resolve(new Response(source, { headers: { "content-type": "text/event-stream" } })));
  const response = await h.win.fetch("stream");
  await new Promise(setImmediate);
  assert.equal(pulls, 0);
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel("stop");
  assert.equal(pulls, 1);
  assert.equal(cancelled, 1);
});

test("EventSource keeps application dispatch and observes registered named events and reconnect", async () => {
  const h = await harness(() => Promise.resolve(new Response()));
  const source = new h.win.EventSource("https://example.test/events");
  assert.ok(source instanceof FakeEventSource);
  assert.equal(h.win.EventSource.CLOSED, 2);
  let count = 0;
  const listener = () => count++;
  source.addEventListener("delta", listener);
  const event = new Event("delta");
  Object.defineProperties(event, { data: { value: "hello" }, lastEventId: { value: "server-1" } });
  source.dispatchEvent(event);
  source.removeEventListener("delta", listener);
  source.dispatchEvent(event);
  source.dispatchEvent(new Event("error"));
  source.close();
  h.flush();
  assert.equal(count, 1);
  assert.equal(h.events.filter(e => e.type === "message").length, 2);
  assert.ok(h.events.some(e => e.type === "connection" && e.status === "connecting"));
  assert.equal(h.events.at(-1).type, "close");
});

test("abort before reading closes observation and preserves a custom reason", async () => {
  const controller = new AbortController();
  const h = await harness(() => Promise.resolve(new Response(new ReadableStream({}), { headers: { "content-type": "text/event-stream" } })));
  const response = await h.win.fetch("stream", { signal: controller.signal });
  controller.abort(false);
  await assert.rejects(response.text(), error => error === false);
  h.flush();
  assert.ok(h.events.some(e => e.type === "close" && e.reason === "aborted"));
});

test("oversized incomplete event truncates observation without changing application bytes", async () => {
  const content = `data: ${"x".repeat(270000)}`;
  const h = await harness(() => Promise.resolve(new Response(content, { headers: { "content-type": "text/event-stream" } })));
  const response = await h.win.fetch("stream");
  assert.equal(await response.text(), content);
  h.flush();
  assert.ok(h.events.some(e => e.type === "truncated" && e.reason === "buffer-limit"));
});

test("EventSource named open and error messages are not lifecycle events", async () => {
  const h = await harness(() => Promise.resolve(new Response()));
  const source = new h.win.EventSource("https://example.test/events");
  source.addEventListener("error", () => {});
  source.addEventListener("open", () => {});
  for (const name of ["error", "open"]) {
    const event = new Event(name);
    Object.defineProperties(event, { data: { value: name }, lastEventId: { value: "42" } });
    source.dispatchEvent(event);
  }
  h.flush();
  assert.deepEqual(h.events.filter(e => e.type === "message").map(e => e.eventName), ["error", "open"]);
  assert.equal(h.events.filter(e => e.type === "connection").length, 1);
  assert.equal(h.events.filter(e => e.type === "open").length, 0);
});

test("SSE parser handles BOM, CR, empty data, ID reset, invalid ID and retry", async () => {
  const input = '\ufeffid: first\rretry: 20\rdata: one\r\rid: bad\0id\rretry: nope\rdata:\r\rid:\r\rdata: three\r\r';
  const bytes = new TextEncoder().encode(input);
  const h = await harness(() => Promise.resolve(new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); } }), { headers: { "content-type": "text/event-stream" } })));
  await (await h.win.fetch("stream")).text();
  h.flush();
  const messages = h.events.filter(event => event.type === "message");
  assert.deepEqual(messages.map(event => [event.data, event.lastEventId, event.retry]), [["one", "first", 20], ["", "first", 20], ["three", "", 20]]);
});

test("init signal overrides Request signal and pause does not close the application stream", async () => {
  const requestController = new AbortController(), initController = new AbortController();
  let appCancelled = 0, streamController;
  const source = new ReadableStream({ start(controller) { streamController = controller; }, cancel() { appCancelled++; } });
  const h = await harness(() => Promise.resolve(new Response(source, { headers: { "content-type": "text/event-stream" } })));
  const response = await h.win.fetch({ method: "POST", signal: requestController.signal }, { signal: initController.signal });
  requestController.abort("ignored");
  h.listeners.get("message")({ data: { source: "websocket-proxy-content", type: "stop-monitoring" } });
  assert.equal(appCancelled, 0);
  streamController.enqueue(new TextEncoder().encode("data: still available\n\n"));
  streamController.close();
  assert.equal(await response.text(), "data: still available\n\n");
  h.flush();
  assert.equal(h.events.filter(event => event.type === "message").length, 0);
  assert.ok(h.events.some(event => event.reason === "monitoring-paused"));
});

test("traffic circuit breaker stops SSE observations without closing the application source", async () => {
  class FixedDate extends Date { static now() { return 1000; } }
  const h = await harness(() => Promise.resolve(new Response()), FixedDate);
  const source = new h.win.EventSource("https://example.test/events");
  let dispatched = 0;
  source.addEventListener("message", () => dispatched++);
  const event = new Event("message");
  Object.defineProperties(event, { data: { value: "tick" }, lastEventId: { value: "1" } });
  // The 801st event in the window trips the circuit breaker.
  for (let index = 0; index < 801; index++) source.dispatchEvent(event);
  h.flush();
  assert.ok(h.events.some(entry => entry.type === "truncated" && entry.reason === "monitoring-paused"));
  assert.ok(h.events.some(entry => entry.type === "close" && entry.status === "paused" && entry.reason === "monitoring-paused"));
  const messagesBeforeResume = h.events.filter(entry => entry.type === "message").length;
  assert.equal(messagesBeforeResume, 800);
  h.listeners.get("message")({ data: { source: "websocket-proxy-content", type: "start-monitoring" } });
  source.dispatchEvent(event);
  h.flush();
  assert.equal(h.events.filter(entry => entry.type === "message").length, messagesBeforeResume);
  assert.equal(dispatched, 802);
  assert.equal(source.readyState, 0);
});

test("Request signal abort is observed when init does not override it", async () => {
  const controller = new AbortController();
  const h = await harness(() => Promise.resolve(new Response(new ReadableStream({}), { headers: { "content-type": "text/event-stream" } })));
  const response = await h.win.fetch({ method: "GET", signal: controller.signal }, { signal: undefined });
  controller.abort("request-abort");
  await assert.rejects(response.text(), error => error === "request-abort");
  h.flush();
  assert.ok(h.events.some(event => event.type === "close" && event.reason === "aborted"));
});

test("wrapped Response methods remain writable and borrowed clone uses its receiver", async () => {
  const nativeJson = Response.prototype.json;
  const nativeClone = Response.prototype.clone;
  const nativeResponse = new Response("data: ok\n\n", { headers: { "content-type": "text/event-stream" } });
  Object.defineProperty(nativeResponse, "url", { get: () => "https://example.test/stream" });
  const h = await harness(() => Promise.resolve(nativeResponse));
  const wrapped = await h.win.fetch("stream");
  const borrowedClone = wrapped.clone;
  const other = new Response("other");
  const clonedOther = borrowedClone.call(other);
  assert.equal(clonedOther.url, nativeClone.call(new Response("other")).url);
  assert.equal(await clonedOther.text(), "other");
  const replacement = () => Promise.resolve({ ok: true });
  wrapped.json = replacement;
  wrapped.clone = replacement;
  assert.equal(wrapped.json, replacement);
  assert.equal(wrapped.clone, replacement);
  assert.equal(Response.prototype.json, nativeJson);
  assert.equal(Response.prototype.clone, nativeClone);
});


test("closed EventSource stops recording subsequently dispatched messages", async () => {
  const h = await harness(() => Promise.resolve(new Response()));
  const source = new h.win.EventSource("https://example.test/events");
  source.close();
  const event = new Event("message");
  Object.defineProperties(event, { data: { value: "late" }, lastEventId: { value: "1" } });
  source.dispatchEvent(event);
  h.flush();
  assert.equal(h.events.filter(entry => entry.type === "message").length, 0);
  assert.equal(h.events.filter(entry => entry.type === "close").length, 1);
});
