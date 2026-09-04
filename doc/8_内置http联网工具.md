# 8_HTTP/联网工具

> 功能：`http_fetch` 内置联网工具  
> 状态：已完成第一版

## 一、功能概述

在现有 Agent 工具调用框架中增加 `http_fetch` 内置工具，用于读取 HTTP/HTTPS 地址的内容。

当前工具属于 `read` 权限，模型可以自动调用，不需要用户审批。它适合读取公开网页、JSON API 和其他只读 HTTP 接口。

## 二、支持能力

- 仅支持 `GET` 请求；
- 支持 `http:` 和 `https:` 协议；
- 支持自定义请求头；
- 自动识别 `application/json` 响应并解析 JSON；
- 非 JSON 响应以文本形式返回；
- 返回请求 URL、方法、状态码、状态文本、响应头、响应体和是否截断；
- 网络异常、`408`、`429` 和 `5xx` 响应会自动重试，最多 3 次；
- 重试间隔依次为 500ms 和 1000ms；
- 用户停止 Agent 时会取消正在进行的请求。

## 三、工具参数

```json
{
  "url": "https://api.example.com/data",
  "headers": {
    "Accept": "application/json"
  }
}
```

参数说明：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `url` | string | 是 | 完整的 HTTP/HTTPS URL |
| `headers` | object | 否 | 请求头键值对，值必须是字符串 |

## 四、返回结果

成功结果示例：

```json
{
  "url": "https://api.example.com/data",
  "method": "GET",
  "attempts": 1,
  "status": 200,
  "statusText": "OK",
  "contentType": "application/json",
  "headers": {
    "content-type": "application/json"
  },
  "truncated": false,
  "body": {
    "ok": true
  }
}
```

响应体最多保留 20,000 个字符。超过限制时，`truncated` 为 `true`，返回内容为截断后的结果。

HTTP 错误状态不会直接作为工具异常抛出，而是将状态码和响应体返回给模型，由模型决定如何解释或继续处理。

## 五、错误处理

| 错误码 | 说明 | 可重试 |
|---|---|---:|
| `INVALID_URL` | URL 格式无效或协议不是 HTTP/HTTPS | 否 |
| `NETWORK_ERROR` | 网络请求失败，重试 3 次后仍未成功 | 是 |
| `TOOL_ABORTED` | 用户停止了当前 Agent 任务 | 否 |
| `TOOL_TIMEOUT` | 工具执行超过统一的 30 秒限制 | 否 |

工具执行器还会统一处理非法参数、未注册工具和高危权限等错误。

## 六、安全边界

- 当前不实现 URL 黑名单或白名单；
- 工具只接受 `http:` 和 `https:`，拒绝 `file:`、`ftp:` 等协议；
- 工具权限为 `read`，不会进入写操作审批流程；
- 响应体限制为 20,000 个字符，避免过大内容占用上下文；
- 请求受统一 30 秒工具超时和 Agent 停止机制约束；
- 自定义请求头由模型提供，调用外部需要认证的接口时应谨慎处理密钥和 Token。

## 七、代码位置

- `electron/tools/builtins.ts`：实现 `http_fetch` 并加入内置工具列表；
- `electron/tools/types.ts`：支持对象类型工具参数和动态请求头 schema；
- `electron/tools/schema.ts`：校验对象参数及其字符串值；
- `electron/tools/executor.ts`：提供统一超时、取消、结果截断和错误包装。

## 八、当前限制与后续方向

当前版本不支持 POST、PUT、PATCH 等可能修改外部数据的请求。后续如需支持，应新增独立的 `write` 权限 HTTP 工具，复用现有审批卡片、参数 hash 校验和 `full` 权限模式，不能直接把写请求加入当前只读工具。

后续还可以增加：

- HTTP 写请求的审批预览；
- 请求体大小限制；
- 重定向策略和响应内容类型限制；
- 代理配置和网络请求审计记录；
- 针对联网工具的自动化集成测试。
