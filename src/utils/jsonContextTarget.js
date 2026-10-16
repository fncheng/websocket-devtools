import { formatProjectionPath } from "./messageProjection.js";

/** @typedef {import("../types/jsonContextMenu.js").JsonContextTarget} JsonContextTarget */
/** @typedef {{ name: string, from: number, to: number, parent: JsonSyntaxNode | null, firstChild: JsonSyntaxNode | null, nextSibling: JsonSyntaxNode | null }} JsonSyntaxNode */
/** @typedef {{ length: number, resolveInner: (position: number, side?: number) => JsonSyntaxNode | null, iterate: (spec: { enter: (node: JsonSyntaxNode) => void }) => void }} JsonSyntaxTree */

const VALUE_NODE_NAMES = new Set(["String", "Number", "True", "False", "Null", "Object", "Array"]);
const CONTAINER_BRACKETS = new Set(["{", "}", "[", "]"]);

const isWhitespaceOrSeparator = (character) => !character || /\s/u.test(character) || character === ",";

/** @param {JsonSyntaxTree} tree */
const hasParseError = (tree) => {
  let containsError = false;
  tree.iterate({
    enter: (node) => {
      if (node.name === "⚠") containsError = true;
    },
  });
  return containsError;
};

/**
 * Reject incomplete syntax trees instead of inferring paths from malformed JSON.
 * @param {JsonSyntaxTree} tree
 * @param {number} documentLength
 * @returns {boolean}
 */
export const isCompleteJsonSyntaxTree = (tree, documentLength) => (
  Boolean(tree) && tree.length === documentLength && !hasParseError(tree)
);

/** @param {JsonSyntaxNode | null} node @param {Set<string>} names */
const getAncestor = (node, names) => {
  let current = node;
  while (current) {
    if (names.has(current.name)) return current;
    current = current.parent;
  }
  return null;
};

/** @param {JsonSyntaxNode} node @param {(child: JsonSyntaxNode) => boolean} predicate */
const getDirectChild = (node, predicate) => {
  let child = node.firstChild;
  while (child) {
    if (predicate(child)) return child;
    child = child.nextSibling;
  }
  return null;
};

/** @param {JsonSyntaxNode} property @param {string} documentText */
const getPropertyName = (property, documentText) => {
  const nameNode = getDirectChild(property, (child) => child.name === "PropertyName");
  if (!nameNode) return null;
  try {
    return JSON.parse(documentText.slice(nameNode.from, nameNode.to));
  } catch {
    return null;
  }
};

/** @param {JsonSyntaxNode} property */
const getPropertyValue = (property) => getDirectChild(
  property,
  (child) => VALUE_NODE_NAMES.has(child.name)
);

/** @param {JsonSyntaxNode} array @param {JsonSyntaxNode} child */
const getArrayIndex = (array, child) => {
  let index = 0;
  let current = array.firstChild;
  while (current) {
    if (VALUE_NODE_NAMES.has(current.name)) {
      if (current.from === child.from && current.to === child.to) return index;
      index += 1;
    }
    current = current.nextSibling;
  }
  return null;
};

/** @param {JsonSyntaxNode} node @param {number} position */
const getBracketContainer = (node, position) => {
  let current = node;
  while (current) {
    if (
      (current.name === "Object" || current.name === "Array") &&
      (current.from === position || current.to === position + 1)
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
};

const isPointInsideCharacter = (fromRect, toRect, x, y) => {
  if (!fromRect || !toRect || fromRect.top !== toRect.top || fromRect.bottom !== toRect.bottom) return false;
  const left = Math.min(fromRect.left, toRect.left);
  const right = Math.max(fromRect.right, toRect.right);
  return right > left && x >= left && x <= right && y >= fromRect.top && y <= fromRect.bottom;
};

/**
 * Confirm that a mouse coordinate lands on an actual document character rather than a nearby insertion point.
 * @param {{ state: { doc: { length: number } }, posAtCoords: (coordinates: { x: number, y: number }) => number | null, coordsAtPos: (position: number, side?: number) => { left: number, right: number, top: number, bottom: number } | null }} view
 * @param {number} x
 * @param {number} y
 * @returns {number | null}
 */
export const getJsonPointerPosition = (view, x, y) => {
  const nearbyPosition = view.posAtCoords({ x, y });
  if (nearbyPosition === null) return null;
  for (const position of [nearbyPosition, nearbyPosition - 1]) {
    if (position < 0 || position >= view.state.doc.length) continue;
    try {
      if (isPointInsideCharacter(view.coordsAtPos(position, 1), view.coordsAtPos(position + 1, -1), x, y)) {
        return position;
      }
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * Convert a keyboard cursor position at EOF into the final JSON character.
 * CodeMirror represents EOF as an insertion point at `documentText.length`,
 * while context targets must resolve an actual character offset.
 * @param {string} documentText
 * @param {number} cursorPosition
 * @returns {number | null}
 */
export const getJsonKeyboardContextPosition = (documentText, cursorPosition) => {
  if (!Number.isInteger(cursorPosition) || cursorPosition < 0 || cursorPosition > documentText.length) {
    return null;
  }
  if (cursorPosition < documentText.length) return cursorPosition;

  for (let position = documentText.length - 1; position >= 0; position -= 1) {
    if (!/\s/u.test(documentText[position])) return position;
  }
  return null;
};

/**
 * Resolve the JSON value associated with an exact document offset.
 * @param {JsonSyntaxTree} tree
 * @param {string} documentText
 * @param {number} position
 * @returns {JsonContextTarget | null}
 */
export const getJsonContextTarget = (tree, documentText, position) => {
  if (!isCompleteJsonSyntaxTree(tree, documentText.length)) return null;
  if (!Number.isInteger(position) || position < 0 || position >= documentText.length) return null;

  const node = tree.resolveInner(position, 1);
  if (!node) return null;
  const character = documentText[position];

  let valueNode = null;
  const property = getAncestor(node, new Set(["Property"]));
  const propertyName = getAncestor(node, new Set(["PropertyName"]));
  const scalarValue = getAncestor(node, VALUE_NODE_NAMES);
  if (property && (character === ":" || propertyName)) {
    valueNode = getPropertyValue(property);
  } else if (scalarValue?.name === "String") {
    // Whitespace and punctuation within a JSON string are part of that string, not separators.
    valueNode = scalarValue;
  } else if (isWhitespaceOrSeparator(character)) {
    return null;
  } else if (CONTAINER_BRACKETS.has(character)) {
    valueNode = getBracketContainer(node, position);
  } else {
    valueNode = scalarValue;
  }

  if (!valueNode || !VALUE_NODE_NAMES.has(valueNode.name)) return null;

  /** @type {(string | number)[]} */
  const tokens = [];
  let current = valueNode;
  while (current.parent) {
    const parent = current.parent;
    if (parent.name === "Property") {
      const propertyName = getPropertyName(parent, documentText);
      if (propertyName === null) return null;
      tokens.push(propertyName);
    } else if (parent.name === "Array") {
      const index = getArrayIndex(parent, current);
      if (index === null) return null;
      tokens.push(index);
    }
    current = parent;
  }
  tokens.reverse();

  return {
    from: valueNode.from,
    to: valueNode.to,
    pathTokens: tokens,
    isRoot: tokens.length === 0,
    valueKind: valueNode.name,
  };
};

/**
 * Copy strings as decoded content while retaining every other JSON value exactly as displayed.
 * @param {string} documentText
 * @param {JsonContextTarget} target
 * @returns {string | null}
 */
export const getJsonContextCopyValue = (documentText, target) => {
  const rawValue = documentText.slice(target.from, target.to);
  if (target.valueKind !== "String") return rawValue;
  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
};

/**
 * Format a context-menu path using the same grammar accepted by field projection.
 * @param {JsonContextTarget} target
 * @returns {string | null}
 */
export const getJsonContextPath = (target) => (
  target.isRoot ? null : formatProjectionPath(target.pathTokens)
);
