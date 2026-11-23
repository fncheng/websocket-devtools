import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("SSE events retain metadata in history and cannot be controlled as WebSocket", async () => {
  let onMessage;
  const deliveries = [];
  const hook = () => ({ addListener() {} });
  const chrome = {
    runtime: { onConnect: hook(), onInstalled: hook(), onMessage: { addListener(fn) { onMessage = fn; } }, onStartup: hook(), onSuspend: hook(), onUpdateAvailable: hook() },
    storage: { local: { get(_keys, done) { done({}); }, set() {} } },
    tabs: { onUpdated: hook(), query() { return Promise.resolve([]); }, sendMessage(...args) { deliveries.push(args); return Promise.resolve(); } },
  };
  const context = vm.createContext({ chrome, URL, console, setInterval() {}, clearInterval() {} });
  vm.runInContext(await readFile(new URL("../src/background/background.js", import.meta.url), "utf8"), context);
  const send = (message, sender = {}) => { let result; onMessage(message, sender, value => { result = value; }); return result; };
  send({ type: "websocket-event-batch", data: [{ id: "sse_1", protocol: "sse", sseSource: "fetch", type: "message", data: "{}", eventName: "delta", lastEventId: "1", messageId: "local-1" }] }, { tab: { id: 7 } });
  const history = send({ type: "get-existing-data" }).data;
  assert.equal(history[0].eventName, "delta");
  assert.equal(history[0].lastEventId, "1");
  assert.equal(history[0].tabId, 7);
  for (const type of ["simulate-message", "simulate-system-event"]) {
    assert.equal(send({ type, data: { tabId: 7, connectionId: "sse_1" } }).success, false);
  }
  assert.equal(deliveries.length, 0);
});

test("SSE history budget includes repeated metadata as well as message data", async () => {
  let onMessage;
  const hook = () => ({ addListener() {} });
  const chrome = { runtime: { onConnect: hook(), onInstalled: hook(), onMessage: { addListener(fn) { onMessage = fn; } }, onStartup: hook(), onSuspend: hook(), onUpdateAvailable: hook() }, storage: { local: { get(_keys, done) { done({}); }, set() {} } }, tabs: { onUpdated: hook(), query() { return Promise.resolve([]); }, sendMessage() { return Promise.resolve(); } } };
  vm.runInContext(await readFile(new URL("../src/background/background.js", import.meta.url), "utf8"), vm.createContext({ chrome, URL, console, setInterval() {}, clearInterval() {} }));
  const send = (message, sender = {}) => { let result; onMessage(message, sender, value => { result = value; }); return result; };
  const id = "x".repeat(5 * 1024 * 1024);
  send({ type: "websocket-event-batch", data: [1, 2].map(n => ({ id: "sse_1", protocol: "sse", type: "message", data: "", lastEventId: id, messageId: String(n) })) }, { tab: { id: 7 } });
  const history = send({ type: "get-existing-data" }).data;
  assert.equal(history.length, 1);
  assert.equal(history[0].messageId, "2");
  assert.equal(history[0].historyTruncated, true);
});

test("repeated evictions and oversized self-eviction keep the byte budget consistent", async () => {
  let onMessage;
  const hook = () => ({ addListener() {} });
  const chrome = { runtime: { onConnect: hook(), onInstalled: hook(), onMessage: { addListener(fn) { onMessage = fn; } }, onStartup: hook(), onSuspend: hook(), onUpdateAvailable: hook() }, storage: { local: { get(_keys, done) { done({}); }, set() {} } }, tabs: { onUpdated: hook(), query() { return Promise.resolve([]); }, sendMessage() { return Promise.resolve(); } } };
  const source = (await readFile(new URL("../src/background/background.js", import.meta.url), "utf8")).replace("const SSE_HISTORY_BYTES = 16 * 1024 * 1024;", "const SSE_HISTORY_BYTES = 600;");
  const context = vm.createContext({ chrome, URL, console, setInterval() {}, clearInterval() {} });
  vm.runInContext(source, context);
  const send = (message, sender = {}) => { let result; onMessage(message, sender, value => { result = value; }); return result; };
  for (let i = 0; i < 40; i++) {
    send({ type: "websocket-event-batch", data: [{ id: "sse_1", protocol: "sse", type: "message", data: "a".repeat(i === 20 ? 1000 : 45), messageId: String(i) }] }, { tab: { id: 7 } });
    const events = send({ type: "get-existing-data" }).data;
    const actual = events.reduce((sum, event) => sum + JSON.stringify(event).length * 2, 0);
    assert.ok(actual <= 600);
    assert.equal(vm.runInContext("sseHistoryBytes", context), actual);
    if (i === 20) assert.equal(events.length, 0);
  }
});
