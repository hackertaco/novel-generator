// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ZodError, ZodIssueCode, type ZodIssue } from "zod";
import {
  extractJsonBlock,
  extractYamlBlock,
  fixYaml,
  formatZodErrorKorean,
} from "@/lib/agents/parse-utils";

/* ------------------------------------------------------------------ */
/*  extractJsonBlock                                                   */
/* ------------------------------------------------------------------ */
describe("extractJsonBlock", () => {
  it("extracts from ```json fenced block", () => {
    const input = 'Some text\n```json\n{"key": "value"}\n```\nMore text';
    expect(extractJsonBlock(input)).toBe('{"key": "value"}');
  });

  it("extracts array from ```json fenced block", () => {
    const input = '```json\n[1, 2, 3]\n```';
    expect(extractJsonBlock(input)).toBe("[1, 2, 3]");
  });

  it("extracts from generic ``` block starting with {", () => {
    const input = '```\n{"a": 1}\n```';
    expect(extractJsonBlock(input)).toBe('{"a": 1}');
  });

  it("extracts from generic ``` block starting with [", () => {
    const input = '```\n["x","y"]\n```';
    expect(extractJsonBlock(input)).toBe('["x","y"]');
  });

  it("does NOT use generic ``` block if content is not JSON-like", () => {
    // Generic block has non-JSON content, so falls through to raw JSON search
    const input = '```\nsome yaml\nfoo: bar\n```\nThen {"real": "json"} here';
    expect(extractJsonBlock(input)).toBe('{"real": "json"}');
  });

  it("extracts raw JSON object from plain text", () => {
    const input = 'Here is the result: {"name": "test"} done.';
    expect(extractJsonBlock(input)).toBe('{"name": "test"}');
  });

  it("extracts raw JSON array from plain text", () => {
    const input = "Result: [1, 2] end.";
    expect(extractJsonBlock(input)).toBe("[1, 2]");
  });

  it("returns trimmed text when no JSON found", () => {
    const input = "  no json here  ";
    expect(extractJsonBlock(input)).toBe("no json here");
  });

  it("handles multiline JSON inside ```json block", () => {
    const input = '```json\n{\n  "a": 1,\n  "b": 2\n}\n```';
    const result = extractJsonBlock(input);
    expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
  });

  it("prefers ```json block over raw JSON", () => {
    const input = '{"raw": true}\n```json\n{"block": true}\n```';
    expect(extractJsonBlock(input)).toBe('{"block": true}');
  });
});

/* ------------------------------------------------------------------ */
/*  extractYamlBlock                                                   */
/* ------------------------------------------------------------------ */
describe("extractYamlBlock", () => {
  it("extracts from ```yaml fenced block", () => {
    const input = "```yaml\nkey: value\n```";
    expect(extractYamlBlock(input)).toBe("key: value");
  });

  it("extracts from ```yml fenced block", () => {
    const input = "```yml\nfoo: bar\n```";
    expect(extractYamlBlock(input)).toBe("foo: bar");
  });

  it("extracts from generic ``` block when content is not JSON-like", () => {
    const input = "```\nname: test\nage: 10\n```";
    expect(extractYamlBlock(input)).toBe("name: test\nage: 10");
  });

  it("does NOT use generic ``` block if content starts with {", () => {
    const input = '```\n{"json": true}\n```';
    // Falls through to plain text return
    expect(extractYamlBlock(input)).toBe('```\n{"json": true}\n```');
  });

  it("does NOT use generic ``` block if content starts with [", () => {
    const input = '```\n["a","b"]\n```';
    expect(extractYamlBlock(input)).toBe('```\n["a","b"]\n```');
  });

  it("returns trimmed text when no YAML block found", () => {
    const input = "  plain yaml content  ";
    expect(extractYamlBlock(input)).toBe("plain yaml content");
  });

  it("handles multiline YAML inside ```yaml block", () => {
    const input = "```yaml\ntitle: Test\nchapters:\n  - one\n  - two\n```";
    expect(extractYamlBlock(input)).toBe("title: Test\nchapters:\n  - one\n  - two");
  });

  it("prefers ```yaml block over generic ``` block", () => {
    const input = "```\ngeneric: yes\n```\n```yaml\nspecific: yes\n```";
    expect(extractYamlBlock(input)).toBe("specific: yes");
  });
});

/* ------------------------------------------------------------------ */
/*  fixYaml                                                            */
/* ------------------------------------------------------------------ */
describe("fixYaml", () => {
  it("fixes inline arrays into separate items", () => {
    const input = '- "apple", "banana", "cherry"';
    const result = fixYaml(input);
    expect(result).toBe('- "apple"\n- "banana"\n- "cherry"');
  });

  it("preserves indentation when fixing inline arrays", () => {
    const input = '    - "a", "b"';
    const result = fixYaml(input);
    expect(result).toBe('    - "a"\n    - "b"');
  });

  it("removes trailing comments/parentheticals", () => {
    const input = '- "value" (this is a comment)';
    const result = fixYaml(input);
    expect(result).toBe('- "value"');
  });

  it("preserves indentation when removing trailing comments", () => {
    const input = '  - "item" (note)';
    const result = fixYaml(input);
    expect(result).toBe('  - "item"');
  });

  it("quotes unquoted values containing colons", () => {
    const input = "description: something with: colons inside";
    const result = fixYaml(input);
    expect(result).toBe('description: "something with: colons inside"');
  });

  it("escapes existing double quotes when quoting colon values", () => {
    const input = 'title: said "hello": world';
    const result = fixYaml(input);
    expect(result).toBe('title: "said \\"hello\\": world"');
  });

  it("passes through normal YAML lines unchanged", () => {
    const input = 'name: "test"\nage: 25\nitems:\n  - one\n  - two';
    expect(fixYaml(input)).toBe(input);
  });

  it("handles empty string", () => {
    expect(fixYaml("")).toBe("");
  });

  it("handles mixed lines", () => {
    const input = [
      "name: simple",
      '- "a", "b"',
      '- "val" (comment)',
      "desc: foo: bar baz",
    ].join("\n");
    const result = fixYaml(input);
    const lines = result.split("\n");
    expect(lines[0]).toBe("name: simple");
    expect(lines[1]).toBe('- "a"');
    expect(lines[2]).toBe('- "b"');
    expect(lines[3]).toBe('- "val"');
    expect(lines[4]).toBe('desc: "foo: bar baz"');
  });
});

/* ------------------------------------------------------------------ */
/*  formatZodErrorKorean                                               */
/* ------------------------------------------------------------------ */
describe("formatZodErrorKorean", () => {
  it("formats invalid_type (undefined) as missing field", () => {
    const error = new ZodError([
      {
        code: ZodIssueCode.invalid_type,
        expected: "string",
        received: "undefined",
        path: ["name"],
        message: "Required",
      } as unknown as ZodIssue,
    ]);
    const result = formatZodErrorKorean(error);
    expect(result).toBe("필드 'name'이(가) 누락되었습니다. 반드시 포함해주세요.");
  });

  it("formats invalid_type (null) as missing field", () => {
    const error = new ZodError([
      {
        code: ZodIssueCode.invalid_type,
        expected: "string",
        received: "null",
        path: ["title"],
        message: "Expected string, received null",
      } as unknown as ZodIssue,
    ]);
    const result = formatZodErrorKorean(error);
    expect(result).toBe("필드 'title'이(가) 누락되었습니다. 반드시 포함해주세요.");
  });

  it("formats invalid_type with wrong type", () => {
    const error = new ZodError([
      {
        code: ZodIssueCode.invalid_type,
        expected: "number",
        received: "string",
        path: ["age"],
        message: "Expected number, received string",
      } as unknown as ZodIssue,
    ]);
    const result = formatZodErrorKorean(error);
    expect(result).toBe(
      "필드 'age'의 타입이 올바르지 않습니다. Expected number, received string"
    );
  });

  it("formats too_small error", () => {
    const error = new ZodError([
      {
        code: ZodIssueCode.too_small,
        minimum: 1,
        type: "string",
        inclusive: true,
        path: ["content"],
        message: "String must contain at least 1 character(s)",
      } as unknown as ZodIssue,
    ]);
    const result = formatZodErrorKorean(error);
    expect(result).toBe(
      "필드 'content'의 값이 너무 작거나 비어있습니다. 최소 요구사항을 충족해주세요."
    );
  });

  it("formats too_big error", () => {
    const error = new ZodError([
      {
        code: ZodIssueCode.too_big,
        maximum: 100,
        type: "number",
        inclusive: true,
        path: ["score"],
        message: "Number must be less than or equal to 100",
      } as unknown as ZodIssue,
    ]);
    const result = formatZodErrorKorean(error);
    expect(result).toBe(
      "필드 'score'의 값이 너무 큽니다. 최대 제한을 확인해주세요."
    );
  });

  it("formats nested path with dot notation", () => {
    const error = new ZodError([
      {
        code: ZodIssueCode.invalid_type,
        expected: "string",
        received: "undefined",
        path: ["characters", 0, "name"],
        message: "Required",
      } as unknown as ZodIssue,
    ]);
    const result = formatZodErrorKorean(error);
    expect(result).toBe(
      "필드 'characters.0.name'이(가) 누락되었습니다. 반드시 포함해주세요."
    );
  });

  it("formats multiple errors joined by newline", () => {
    const error = new ZodError([
      {
        code: ZodIssueCode.invalid_type,
        expected: "string",
        received: "undefined",
        path: ["a"],
        message: "Required",
      } as unknown as ZodIssue,
      {
        code: ZodIssueCode.too_small,
        minimum: 1,
        type: "array",
        inclusive: true,
        path: ["b"],
        message: "Array must contain at least 1 element(s)",
      } as unknown as ZodIssue,
    ]);
    const result = formatZodErrorKorean(error);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("'a'");
    expect(lines[1]).toContain("'b'");
  });

  it("formats default/unknown error code", () => {
    const error = new ZodError([
      {
        code: ZodIssueCode.custom,
        path: ["field"],
        message: "Custom validation failed",
      },
    ]);
    const result = formatZodErrorKorean(error);
    expect(result).toBe("필드 'field': Custom validation failed");
  });
});
