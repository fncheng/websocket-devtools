import assert from "node:assert/strict";
import test from "node:test";
import { json } from "@codemirror/lang-json";
import {
  getJsonContextCopyValue,
  getJsonContextPath,
  getJsonPointerPosition,
  getJsonContextTarget,
  isCompleteJsonSyntaxTree,
} from "../src/utils/jsonContextTarget.js";

const parse = (source) => json().language.parser.parse(source);

const targetAt = (source, position) => getJsonContextTarget(parse(source), source, position);

test("resolves property names and every character inside a string to its value", () => {
  const source = '{"user":{"name":"A B,C{D}"}}';
  const keyTarget = targetAt(source, source.indexOf('"name"'));
  const whitespaceTarget = targetAt(source, source.indexOf(" B"));
  const commaTarget = targetAt(source, source.indexOf(","));
  const bracketTarget = targetAt(source, source.lastIndexOf("{"));

  for (const target of [keyTarget, whitespaceTarget, commaTarget, bracketTarget]) {
    assert.ok(target);
    assert.equal(getJsonContextPath(target), "user.name");
    assert.equal(getJsonContextCopyValue(source, target), "A B,C{D}");
  }
});

test("resolves arrays and containers while rejecting structural separators and whitespace", () => {
  const source = '{"items":[{"id":1},2], "other": true}';
  const arrayTarget = targetAt(source, source.indexOf("["));
  const objectTarget = targetAt(source, source.indexOf("{" , source.indexOf("[")));
  const numberTarget = targetAt(source, source.indexOf("1"));
  const commaPosition = source.indexOf("},") + 1;
  const whitespacePosition = source.indexOf(", ") + 1;

  assert.equal(getJsonContextPath(arrayTarget), "items");
  assert.equal(getJsonContextCopyValue(source, arrayTarget), '[{"id":1},2]');
  assert.equal(getJsonContextPath(objectTarget), "items[0]");
  assert.equal(getJsonContextPath(numberTarget), "items[0].id");
  assert.equal(targetAt(source, commaPosition), null);
  assert.equal(targetAt(source, whitespacePosition), null);
});

test("formats special, empty, Unicode, and escaped property names with projection-compatible paths", () => {
  const source = '{"a.b":{"":1,"中文":"值","a,b":2,"a\\\"b":900719925474099312345}}';
  const dotTarget = targetAt(source, source.indexOf('"a.b"'));
  const emptyTarget = targetAt(source, source.indexOf('""'));
  const unicodeTarget = targetAt(source, source.indexOf('"中文"'));
  const commaKeyTarget = targetAt(source, source.indexOf(",", source.indexOf('"a,b"')));
  const escapedTarget = targetAt(source, source.indexOf('"a\\\"b"'));

  assert.equal(getJsonContextPath(dotTarget), '["a.b"]');
  assert.equal(getJsonContextPath(emptyTarget), '["a.b"][""]');
  assert.equal(getJsonContextPath(unicodeTarget), '["a.b"]["中文"]');
  assert.equal(getJsonContextPath(commaKeyTarget), '["a.b"]["a,b"]');
  assert.equal(getJsonContextCopyValue(source, commaKeyTarget), "2");
  assert.equal(getJsonContextPath(escapedTarget), '["a.b"]["a\\\"b"]');
  assert.equal(getJsonContextCopyValue(source, escapedTarget), "900719925474099312345");
});

test("keeps duplicate same-line fields distinct and preserves their original value slices", () => {
  const source = '{"x":1,"x":2,"nested":{"x":3}}';
  const first = targetAt(source, source.indexOf('"x"'));
  const second = targetAt(source, source.indexOf('"x"', source.indexOf('"x"') + 1));
  const nested = targetAt(source, source.lastIndexOf('"x"'));

  assert.equal(getJsonContextPath(first), "x");
  assert.equal(getJsonContextCopyValue(source, first), "1");
  assert.equal(getJsonContextPath(second), "x");
  assert.equal(getJsonContextCopyValue(source, second), "2");
  assert.equal(getJsonContextPath(nested), "nested.x");
  assert.equal(getJsonContextCopyValue(source, nested), "3");
});

test("supports root values but deliberately withholds a root property path", () => {
  const objectSource = '{"value":false}';
  const arraySource = '["", null]';
  const objectTarget = targetAt(objectSource, 0);
  const arrayTarget = targetAt(arraySource, 0);
  const emptyStringTarget = targetAt(arraySource, 1);

  assert.equal(objectTarget.isRoot, true);
  assert.equal(getJsonContextPath(objectTarget), null);
  assert.equal(getJsonContextCopyValue(objectSource, objectTarget), objectSource);
  assert.equal(arrayTarget.isRoot, true);
  assert.equal(getJsonContextPath(arrayTarget), null);
  assert.equal(getJsonContextCopyValue(arraySource, arrayTarget), arraySource);
  assert.equal(getJsonContextPath(emptyStringTarget), "[0]");
  assert.equal(getJsonContextCopyValue(arraySource, emptyStringTarget), "");
});

test("rejects malformed, incomplete, and non-JSON text instead of inferring a partial path", () => {
  for (const source of ['{"value":', '{"value": 1', 'prefix {"value":1}', '{"items":[1,]}']) {
    const tree = parse(source);
    assert.equal(isCompleteJsonSyntaxTree(tree, source.length), false);
    assert.equal(getJsonContextTarget(tree, source, Math.max(0, source.length - 1)), null);
  }
});

test("normalizes a pointer from the nearest insertion point to an actual character only", () => {
  const rects = [0, 10, 20, 30].map((left) => ({ left, right: left, top: 4, bottom: 16 }));
  const calls = [];
  const view = {
    state: { doc: { length: 3 } },
    posAtCoords: () => 2,
    coordsAtPos: (position, side) => {
      calls.push([position, side]);
      return rects[position] || null;
    },
  };

  assert.equal(getJsonPointerPosition(view, 16, 10), 1);
  assert.equal(getJsonPointerPosition(view, 26, 10), 2);
  assert.equal(getJsonPointerPosition(view, 35, 10), null);
  assert.deepEqual(calls.slice(0, 2), [[2, 1], [3, -1]]);
});

test("uses opposite cursor sides to keep a soft-wrapped final character on its visual line", () => {
  const calls = [];
  const view = {
    state: { doc: { length: 2 } },
    posAtCoords: () => 1,
    coordsAtPos: (position, side) => {
      calls.push([position, side]);
      if (position === 1 && side === 1) return { left: 10, right: 10, top: 4, bottom: 16 };
      if (position === 2 && side === -1) return { left: 20, right: 20, top: 4, bottom: 16 };
      return { left: 0, right: 0, top: 24, bottom: 36 };
    },
  };

  assert.equal(getJsonPointerPosition(view, 16, 10), 1);
  assert.deepEqual(calls, [[1, 1], [2, -1]]);
});
