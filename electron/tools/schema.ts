import type { ToolInputSchema } from './types'

export function validateArguments(
  args: Record<string, unknown>,
  schema: ToolInputSchema
): string | null {
  for (const key of schema.required ?? []) {
    if (args[key] === undefined || args[key] === null) {
      return `缺少必需参数 "${key}"`
    }
  }

  for (const [key, property] of Object.entries(schema.properties)) {
    const value = args[key]
    if (value === undefined || value === null) continue

    switch (property.type) {
      case 'string':
        if (typeof value !== 'string') return `参数 "${key}" 必须是字符串`
        break
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value))
          return `参数 "${key}" 必须是数字`
        break
      case 'integer':
        if (typeof value !== 'number' || !Number.isInteger(value))
          return `参数 "${key}" 必须是整数`
        break
      case 'boolean':
        if (typeof value !== 'boolean') return `参数 "${key}" 必须是布尔值`
        break
      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return `参数 "${key}" 必须是对象`
        }
        if (property.additionalProperties) {
          for (const [nestedKey, nestedValue] of Object.entries(value)) {
            if (property.additionalProperties.type === 'string' && typeof nestedValue !== 'string') {
              return `参数 "${key}.${nestedKey}" 必须是字符串`
            }
          }
        }
        break
    }

    if (property.enum && !property.enum.includes(value as string | number)) {
      return `参数 "${key}" 必须是以下值之一: ${property.enum.join(', ')}`
    }
  }

  return null
}
