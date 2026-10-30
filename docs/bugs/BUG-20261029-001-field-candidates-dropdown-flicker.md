---
id: BUG-20261029-001
type: bug
status: confirmed
created: 2026-10-29
updated: 2026-10-29
features:
  - message-field-projection
related: []
---

# 消息列表字段候选下拉列表在实时接收时闪烁

## 现象

在消息列表切换至“指定字段”模式后，打开“字段候选”下拉列表。若 WebSocket 此时持续接收消息，下拉菜单会不断闪烁，影响字段选择。

## 预期行为

下拉菜单展开期间，候选项应保持稳定；实时接收的新消息仍应被正常记录，但不应触发已展开菜单的重绘。

## 复现步骤

1. 打开至少一个持续接收 WebSocket 消息的连接。
2. 在消息列表中切换至“指定字段”模式。
3. 打开“字段候选”下拉列表。
4. 观察持续到达的消息导致下拉菜单闪烁。

## 原因

`MessageProjectionControls` 直接以实时更新的 `messages` 计算候选项。每条新消息都会生成新的候选数组并替换原生 `<select>` 内的 `<option>` 节点；浏览器在下拉菜单展开时反复重绘该菜单，因此出现闪烁。

## 修复方案

在 `src/components/MessageProjectionControls.jsx` 中冻结下拉菜单展开时的候选项快照。

- 在鼠标按下或用于展开下拉菜单的键盘操作发生时，保存当前候选项。
- 下拉菜单处于展开交互期间，只渲染该快照，不随 `messages` 的实时变化替换 `<option>`。
- 用户选择字段或下拉框失焦后，清除快照并恢复实时候选更新。

该修复不暂停消息接收，只延迟候选项在当前下拉交互完成前的可见更新。

## 修改范围

- `src/components/MessageProjectionControls.jsx`

## 验证

- [x] `node --test test/messageProjection.test.js`：16/16 通过。
- [x] `git diff --check`：通过。
- [ ] Chrome DevTools 中持续接收消息时，下拉列表展开后不再闪烁。

补充说明：`pnpm test` 执行结果为 55 项通过、1 项失败；失败项为 `test/navigationLifecycle.test.js` 的“仅顶层 frame 发送 page-loaded”用例，单独重跑仍失败，未纳入本 Bug 的修改范围。

## 当前状态

代码修复已完成，但尚未完成 Chrome DevTools 的人工验收，因此状态保持为 `confirmed`。完成人工验收后，将状态更新为 `fixed`。
