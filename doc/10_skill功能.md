# 10_Skill 功能

> 版本：Skill V1  
> 状态：已完成第一版

## 一、功能概述

Skill 是用户可以手动启用的 Markdown 提示词能力包。Skill 不执行脚本、不注册工具，也不会绕过现有工具权限和审批流程。

支持两种来源：

- 全局 Skill：`<Electron userData>/skills`
- 项目 Skill：`<项目目录>/.agent/skills`

Skill 的启用状态按会话保存。项目 Skill 与全局 Skill 同名时，项目版本覆盖全局版本。

## 二、目录和文件格式

每个 Skill 使用独立目录，目录中必须包含 `SKILL.md`：

```text
skills/
  code-review/
    SKILL.md
```

文件格式：

```md
---
name: code-review
description: 代码审查规范
version: 1.0.0
tags: [code, review]
---

审查代码时优先检查正确性、安全边界和缺失测试。
```

`name` 必填，必须以字母开头，并且只能包含字母、数字、短横线和下划线。正文不能为空。`description`、`version` 和 `tags` 用于页面展示。

## 三、使用方式

1. 在左侧进入 `Skills` 页面。
2. 查看页面显示的全局目录和项目目录。
3. 按目录格式创建或修改 `SKILL.md`。
4. 点击“刷新”。
5. 为当前会话勾选需要启用的 Skill。
6. 返回聊天发送消息，启用的 Skill 会加入 Agent 系统提示词。

项目级 Skill 首次发现时不会自动启用。切换项目目录后，页面会重新扫描，并清理当前会话中已经不存在的 Skill ID。

## 四、加载和覆盖规则

- 只扫描规定目录下一级子目录中的 `SKILL.md`。
- 不跟随目录符号链接，不读取 Skill 目录外的文件。
- 同名项目 Skill 覆盖全局 Skill。
- 同一来源存在重复 `name` 时保留先发现的 Skill，并报告重复错误。
- 单个 `SKILL.md` 最大 64KB。
- 单次请求注入的 Skill 正文合计最大 200KB，超出部分不再注入。
- 无效文件只在 Skills 页面显示错误，不影响其他 Skill 或聊天功能。

## 五、数据流

```text
Skills 页面扫描目录
  -> 用户为当前会话勾选 Skill
  -> enabledSkillIds 保存到会话 localStorage
  -> 发送消息时传给 Electron 主进程
  -> SkillManager 重新扫描并解析有效 Skill
  -> Agent Loop 将正文追加到系统提示词
  -> 模型按 Skill 规范执行任务
```

## 六、安全边界

- Skill V1 只注入文本提示词。
- 不支持脚本、命令、静态资源自动读取或自动工具注册。
- Skill 不能修改工具权限等级。
- `write` 工具仍遵守 ask/full 权限模式。
- `dangerous` 工具仍按现有规则拒绝执行。

## 七、相关代码

- `electron/skills.ts`：扫描、解析、覆盖和提示词生成。
- `shared/skills.ts`：共享 Skill 类型。
- `src/components/SkillManager.tsx`：Skills 管理页面。
- `electron/agentLoop.ts`：将启用 Skill 注入系统提示词。
- `tests/skills.test.ts`：解析、覆盖、限制和容错测试。
