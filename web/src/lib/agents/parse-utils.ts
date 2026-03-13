import { ZodError } from "zod";

/**
 * Extract JSON from LLM output (handles ```json blocks, plain JSON, etc.)
 */
export function extractJsonBlock(text: string): string {
  // Try ```json ... ``` block
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) return jsonBlockMatch[1].trim();

  // Try generic ``` ... ``` block containing JSON
  const genericBlockMatch = text.match(/```\s*([\s\S]*?)```/);
  if (genericBlockMatch) {
    const content = genericBlockMatch[1].trim();
    if (content.startsWith("{") || content.startsWith("[")) return content;
  }

  // Try to find raw JSON object or array
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) return jsonMatch[1].trim();

  return text.trim();
}

/**
 * Extract YAML from LLM output (handles ```yaml blocks, plain YAML, etc.)
 */
export function extractYamlBlock(text: string): string {
  // Try ```yaml or ```yml block
  const yamlBlockMatch = text.match(/```ya?ml\s*([\s\S]*?)```/);
  if (yamlBlockMatch) return yamlBlockMatch[1].trim();

  // Try generic ``` ... ``` block (if it doesn't look like JSON)
  const genericBlockMatch = text.match(/```\s*([\s\S]*?)```/);
  if (genericBlockMatch) {
    const content = genericBlockMatch[1].trim();
    if (!content.startsWith("{") && !content.startsWith("[")) return content;
  }

  return text.trim();
}

/**
 * Fix common YAML issues from LLM output.
 * Handles: inline arrays, trailing comments, unquoted special chars.
 */
export function fixYaml(yamlStr: string): string {
  const lines = yamlStr.split("\n");
  const fixed: string[] = [];

  for (const line of lines) {
    // Fix inline arrays: - "a", "b" -> separate items
    if (/^(\s*)-\s*"[^"]+",\s*"/.test(line)) {
      const indent = line.length - line.trimStart().length;
      const items = line.match(/"([^"]*)"/g) || [];
      for (const item of items) {
        fixed.push(" ".repeat(indent) + `- ${item}`);
      }
    }
    // Fix trailing comments/parentheticals: - "value" (comment) -> - "value"
    else if (/^(\s*)-\s*"[^"]+"\s*\(/.test(line)) {
      const indent = line.length - line.trimStart().length;
      const match = line.match(/"([^"]*)"/);
      if (match) {
        fixed.push(" ".repeat(indent) + `- "${match[1]}"`);
      } else {
        fixed.push(line);
      }
    }
    // Fix unquoted values with special YAML chars (colon in value)
    else if (/^(\s*\w+):\s+[^"'\[\{].*:\s/.test(line)) {
      const colonIdx = line.indexOf(":");
      const key = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 1).trim();
      fixed.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
    } else {
      fixed.push(line);
    }
  }

  return fixed.join("\n");
}

/**
 * Convert Zod validation errors to Korean repair prompt.
 */
export function formatZodErrorKorean(error: ZodError): string {
  const messages = error.issues.map((issue) => {
    const path = issue.path.join(".");
    switch (issue.code) {
      case "invalid_type":
        if (
          "received" in issue &&
          (issue.received === "undefined" || issue.received === "null")
        ) {
          return `필드 '${path}'이(가) 누락되었습니다. 반드시 포함해주세요.`;
        }
        return `필드 '${path}'의 타입이 올바르지 않습니다. ${issue.message}`;
      case "too_small":
        return `필드 '${path}'의 값이 너무 작거나 비어있습니다. 최소 요구사항을 충족해주세요.`;
      case "too_big":
        return `필드 '${path}'의 값이 너무 큽니다. 최대 제한을 확인해주세요.`;
      case "invalid_value":
        return `필드 '${path}'에 유효하지 않은 값이 있습니다. ${issue.message}`;
      default:
        return `필드 '${path}': ${issue.message}`;
    }
  });

  return messages.join("\n");
}
