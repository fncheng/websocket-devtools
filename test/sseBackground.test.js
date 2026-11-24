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

test("SSE truncation is attributed to the connection that lost history", async () => {
  let onMessage;
  const hook = () => ({ addListener() {} });
  const chrome = { runtime: { onConnect: hook(), onInstalled: hook(), onMessage: { addListener(fn) { onMessage = fn; } }, onStartup: hook(), onSuspend: hook(), onUpdateAvailable: hook() }, storage: { local: { get(_keys, done) { done({}); }, set() {} } }, tabs: { onUpdated: hook(), query() { return Promise.resolve([]); }, sendMessage() { return Promise.resolve(); } } };
  const source = (await readFile(new URL("../src/background/background.js", import.meta.url), "utf8"))
    .replace("const SSE_HISTORY_LIMIT = 20000;", "const SSE_HISTORY_LIMIT = 5;");
  const context = vm.createContext({ chrome, URL, console, setInterval() {}, clearInterval() {} });
  vm.runInContext(source, context);
  const send = (message, sender = {}) => { let result; onMessage(message, sender, value => { result = value; }); return result; };
  const events = [
    ...Array.from({ length: 4 }, (_, index) => ({ id: "sse_a", protocol: "sse", type: "message", data: "", messageId: `a${index}` })),
    ...Array.from({ length: 3 }, (_, index) => ({ id: "sse_b", protocol: "sse", type: "message", data: "", messageId: `b${index}` })),
  ];
  for (const event of events) {
    send({ type: "websocket-event", data: { ...event } }, { tab: { id: event.id === "sse_a" ? 7 : 8 } });
  }
  const history = send({ type: "get-existing-data" }).data;
  assert.equal(history.length, 5);
  assert.equal(vm.runInContext("sseHistoryCount", context), 5);
  assert.deepEqual(Array.from(history, event => event.messageId), ["a2", "a3", "b0", "b1", "b2"]);
  const truncated = history.filter(event => event.historyTruncated);
  assert.equal(truncated.length, 1);
  assert.equal(truncated[0].id, "sse_a");
  assert.equal(history.filter(event => event.id === "sse_b").some(event => event.historyTruncated), false);
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
    if (i === 20) {
      assert.equal(events.length, 1);
      assert.equal(events[0].type, "history-summary");
      assert.equal(events[0].historyTruncated, true);
    }
  }
});


test("SSE history eviction informs live panels about the affected older connection", async () => {
  let onMessage, onConnect, onPortMessage;
  const sent = [];
  const hook = () => ({ addListener() {} });
  const chrome = {
    runtime: { onConnect: { addListener(fn) { onConnect = fn; } }, onInstalled: hook(), onMessage: { addListener(fn) { onMessage = fn; } }, onStartup: hook(), onSuspend: hook(), onUpdateAvailable: hook() },
    storage: { local: { get(_keys, done) { done({}); }, set() {} } },
    tabs: { onUpdated: hook(), query() { return Promise.resolve([]); }, sendMessage() { return Promise.resolve(); } },
  };
  const source = (await readFile(new URL("../src/background/background.js", import.meta.url), "utf8"))
    .replace("const SSE_HISTORY_LIMIT = 20000;", "const SSE_HISTORY_LIMIT = 2;");
  vm.runInContext(source, vm.createContext({ chrome, URL, console, setInterval() {}, clearInterval() {} }));
  const port = { name: "devtools", onMessage: { addListener(fn) { onPortMessage = fn; } }, onDisconnect: hook(), postMessage(value) { sent.push(value); } };
  onConnect(port);
  onPortMessage({ type: "init", tabId: 7 });
  const send = (id, n) => onMessage({ type: "websocket-event", data: { id, protocol: "sse", type: "message", messageId: `${id}-${n}`, data: "x" } }, { tab: { id: 7 } }, () => {});
  send("sse_a", 1); send("sse_a", 2); send("sse_b", 1);
  const updates = sent.filter(entry => entry.type === "sse-history-truncated");
  assert.ok(updates.some(entry => entry.data.id === "sse_a" && entry.data.tabId === 7));
  assert.ok(sent.findIndex(entry => entry.type === "websocket-event" && entry.data.id === "sse_b") < sent.findIndex(entry => entry.type === "sse-history-truncated"));
});
