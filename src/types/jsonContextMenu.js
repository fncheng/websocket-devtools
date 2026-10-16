/**
 * @typedef {string | number} JsonPathToken
 * @typedef {{ from: number, to: number, pathTokens: JsonPathToken[], isRoot: boolean, valueKind: "String" | "Number" | "True" | "False" | "Null" | "Object" | "Array" }} JsonContextTarget
 * @typedef {{ id: number, document: import("@codemirror/state").Text, target: JsonContextTarget, selection: { from: number, to: number }, x: number, y: number }} JsonContextMenuState
 */

export {};
