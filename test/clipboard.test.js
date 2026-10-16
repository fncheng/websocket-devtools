import assert from "node:assert/strict";
import test from "node:test";
import { copyTextToClipboard } from "../src/utils/clipboard.js";

const withClipboardEnvironment = async ({ writeText, execCommand }, callback) => {
  const keys = ["navigator", "document", "window", "HTMLElement"];
  const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  class FakeElement {
    focus() {}
  }
  const selection = {
    rangeCount: 0,
    removeAllRanges() {},
    addRange() {},
  };
  const textArea = new FakeElement();
  textArea.style = {};
  textArea.setAttribute = () => {};
  textArea.select = () => {};
  textArea.remove = () => {};
  const fakeDocument = {
    body: { appendChild() {} },
    activeElement: new FakeElement(),
    createElement: () => textArea,
    execCommand,
  };

  Object.defineProperties(globalThis, {
    navigator: { configurable: true, value: { clipboard: { writeText } } },
    document: { configurable: true, value: fakeDocument },
    window: { configurable: true, value: { getSelection: () => selection } },
    HTMLElement: { configurable: true, value: FakeElement },
  });
  try {
    await callback();
  } finally {
    for (const key of keys) {
      const original = originals.get(key);
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    }
  }
};

test("treats an empty string as a successful clipboard write", async () => {
  const copiedValues = [];
  await withClipboardEnvironment({
    writeText: async (value) => { copiedValues.push(value); },
    execCommand: () => { throw new Error("fallback should not run"); },
  }, async () => {
    assert.equal(await copyTextToClipboard(""), true);
  });
  assert.deepEqual(copiedValues, [""]);
});

test("does not report success when clipboard and fallback copying both fail", async () => {
  let fallbackCalls = 0;
  await withClipboardEnvironment({
    writeText: async () => { throw new Error("clipboard denied"); },
    execCommand: () => { fallbackCalls += 1; return false; },
  }, async () => {
    assert.equal(await copyTextToClipboard("value"), false);
  });
  assert.equal(fallbackCalls, 1);
});

test("uses a true fallback result when the asynchronous clipboard API is unavailable", async () => {
  let fallbackCalls = 0;
  await withClipboardEnvironment({
    writeText: async () => { throw new Error("clipboard denied"); },
    execCommand: () => { fallbackCalls += 1; return true; },
  }, async () => {
    assert.equal(await copyTextToClipboard("value"), true);
  });
  assert.equal(fallbackCalls, 1);
});
