// @vitest-environment node
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// Mock OpenAI before any imports that use it
const mockCreate = vi.fn();

vi.mock("openai", () => {
  const MockOpenAI = function () {
    return {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };
  };
  return { default: MockOpenAI };
});

import { LLMAgent, getAgent } from "@/lib/agents/llm-agent";
import { AgentCallError } from "@/lib/agents/types";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  mockCreate.mockReset();
});

// Helper to build a mock chat completion response
function mockResponse(content: string, promptTokens = 100, completionTokens = 50) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  };
}

const TestSchema = z.object({ name: z.string(), value: z.number() });

describe("LLMAgent", () => {
  describe("call()", () => {
    it("returns content from LLM response", async () => {
      mockCreate.mockResolvedValueOnce(mockResponse("Hello world"));
      const agent = new LLMAgent();
      const result = await agent.call({ prompt: "Say hello" });
      expect(result.data).toBe("Hello world");
    });

    it("tracks token usage in result", async () => {
      mockCreate.mockResolvedValueOnce(mockResponse("response", 200, 80));
      const agent = new LLMAgent();
      const result = await agent.call({ prompt: "test" });
      expect(result.usage.prompt_tokens).toBe(200);
      expect(result.usage.completion_tokens).toBe(80);
      expect(result.usage.total_tokens).toBe(280);
    });

    it("calculates cost correctly", async () => {
      mockCreate.mockResolvedValueOnce(mockResponse("response", 1_000_000, 1_000_000));
      const agent = new LLMAgent();
      const result = await agent.call({ prompt: "test" });
      // gpt-4o-mini pricing: input 0.15/1M, output 0.6/1M
      // cost = (1M / 1M) * 0.15 + (1M / 1M) * 0.6 = 0.75
      expect(result.usage.cost_usd).toBeCloseTo(0.75, 5);
    });

    it("uses specified model override", async () => {
      mockCreate.mockResolvedValueOnce(mockResponse("ok"));
      const agent = new LLMAgent();
      const result = await agent.call({ prompt: "test", model: "gpt-4o" });
      expect(result.model).toBe("gpt-4o");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-4o" })
      );
    });

    it("returns empty string when no content in response", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null } }],
        usage: { prompt_tokens: 10, completion_tokens: 0 },
      });
      const agent = new LLMAgent();
      const result = await agent.call({ prompt: "test" });
      expect(result.data).toBe("");
    });

    it("passes system message when provided", async () => {
      mockCreate.mockResolvedValueOnce(mockResponse("ok"));
      const agent = new LLMAgent();
      await agent.call({ prompt: "hello", system: "You are helpful" });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: "system", content: "You are helpful" },
            { role: "user", content: "hello" },
          ],
        })
      );
    });

    it("uses default temperature and maxTokens", async () => {
      mockCreate.mockResolvedValueOnce(mockResponse("ok"));
      const agent = new LLMAgent();
      await agent.call({ prompt: "test" });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
          max_tokens: 4096,
        })
      );
    });
  });

  describe("callStructured()", () => {
    it("returns parsed and validated data on first attempt", async () => {
      mockCreate.mockResolvedValueOnce(
        mockResponse('{"name": "test", "value": 42}')
      );
      const agent = new LLMAgent();
      const result = await agent.callStructured({
        prompt: "give me json",
        schema: TestSchema,
        format: "json",
      });
      expect(result.data).toEqual({ name: "test", value: 42 });
      expect(result.attempt).toBe(1);
    });

    it("retries on parse failure and succeeds on 2nd attempt", async () => {
      mockCreate
        .mockResolvedValueOnce(mockResponse("not valid json at all!!!"))
        .mockResolvedValueOnce(
          mockResponse('{"name": "retry", "value": 99}')
        );
      const agent = new LLMAgent();
      const result = await agent.callStructured({
        prompt: "give json",
        schema: TestSchema,
        format: "json",
      });
      expect(result.data).toEqual({ name: "retry", value: 99 });
      expect(result.attempt).toBe(2);
    });

    it("retries on validation failure and succeeds", async () => {
      // First: valid JSON but fails schema (value should be number)
      mockCreate
        .mockResolvedValueOnce(
          mockResponse('{"name": "test", "value": "not_a_number"}')
        )
        .mockResolvedValueOnce(
          mockResponse('{"name": "test", "value": 7}')
        );
      const agent = new LLMAgent();
      const result = await agent.callStructured({
        prompt: "give json",
        schema: TestSchema,
        format: "json",
      });
      expect(result.data).toEqual({ name: "test", value: 7 });
      expect(result.attempt).toBe(2);
    });

    it("throws AgentCallError after all attempts fail", async () => {
      mockCreate
        .mockResolvedValueOnce(mockResponse("bad1"))
        .mockResolvedValueOnce(mockResponse("bad2"))
        .mockResolvedValueOnce(mockResponse("bad3"));
      const agent = new LLMAgent();
      await expect(
        agent.callStructured({
          prompt: "give json",
          schema: TestSchema,
          format: "json",
          retryCount: 3,
        })
      ).rejects.toThrow(AgentCallError);
    });

    it("includes attempt history in AgentCallError", async () => {
      mockCreate
        .mockResolvedValueOnce(mockResponse("bad1"))
        .mockResolvedValueOnce(mockResponse("bad2"))
        .mockResolvedValueOnce(mockResponse("bad3"));
      const agent = new LLMAgent();
      try {
        await agent.callStructured({
          prompt: "give json",
          schema: TestSchema,
          format: "json",
          retryCount: 3,
        });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(AgentCallError);
        const agentErr = err as AgentCallError;
        expect(agentErr.attempts).toHaveLength(3);
        expect(agentErr.attempts[0].error).toContain("Parse error");
      }
    });

    it("accumulates token usage across retries", async () => {
      mockCreate
        .mockResolvedValueOnce(mockResponse("bad", 100, 50))
        .mockResolvedValueOnce(
          mockResponse('{"name": "ok", "value": 1}', 120, 60)
        );
      const agent = new LLMAgent();
      const result = await agent.callStructured({
        prompt: "give json",
        schema: TestSchema,
        format: "json",
      });
      expect(result.usage.prompt_tokens).toBe(220);
      expect(result.usage.completion_tokens).toBe(110);
      expect(result.usage.total_tokens).toBe(330);
    });

    it("extracts JSON from markdown code block", async () => {
      const wrapped = '```json\n{"name": "block", "value": 5}\n```';
      mockCreate.mockResolvedValueOnce(mockResponse(wrapped));
      const agent = new LLMAgent();
      const result = await agent.callStructured({
        prompt: "give json",
        schema: TestSchema,
        format: "json",
      });
      expect(result.data).toEqual({ name: "block", value: 5 });
    });

    it("extracts YAML format correctly", async () => {
      const yamlContent = "```yaml\nname: yamltest\nvalue: 10\n```";
      mockCreate.mockResolvedValueOnce(mockResponse(yamlContent));
      const agent = new LLMAgent();
      const result = await agent.callStructured({
        prompt: "give yaml",
        schema: TestSchema,
        format: "yaml",
      });
      expect(result.data).toEqual({ name: "yamltest", value: 10 });
    });

    it("uses default retryCount of 3", async () => {
      mockCreate
        .mockResolvedValueOnce(mockResponse("bad1"))
        .mockResolvedValueOnce(mockResponse("bad2"))
        .mockResolvedValueOnce(mockResponse("bad3"));
      const agent = new LLMAgent();
      await expect(
        agent.callStructured({
          prompt: "give json",
          schema: TestSchema,
          format: "json",
        })
      ).rejects.toThrow("after 3 attempts");
    });
  });

  describe("callStream()", () => {
    it("yields chunks and returns TokenUsage", async () => {
      const chunks = [
        { choices: [{ delta: { content: "Hello" } }], usage: null },
        { choices: [{ delta: { content: " world" } }], usage: null },
        {
          choices: [{ delta: {} }],
          usage: { prompt_tokens: 50, completion_tokens: 20 },
        },
      ];
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      };
      mockCreate.mockResolvedValueOnce(asyncIterable);

      const agent = new LLMAgent();
      const gen = agent.callStream({ prompt: "stream test" });

      const yielded: string[] = [];
      let result = await gen.next();
      while (!result.done) {
        yielded.push(result.value);
        result = await gen.next();
      }

      expect(yielded).toEqual(["Hello", " world"]);
      const usage = result.value;
      expect(usage.prompt_tokens).toBe(50);
      expect(usage.completion_tokens).toBe(20);
      expect(usage.total_tokens).toBe(70);
    });

    it("estimates tokens when usage not reported in stream", async () => {
      const chunks = [
        { choices: [{ delta: { content: "Some text here" } }] },
      ];
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      };
      mockCreate.mockResolvedValueOnce(asyncIterable);

      const agent = new LLMAgent();
      const gen = agent.callStream({ prompt: "test" });

      let result = await gen.next();
      while (!result.done) {
        result = await gen.next();
      }

      const usage = result.value;
      expect(usage.completion_tokens).toBe(Math.ceil("Some text here".length / 4));
      expect(usage.prompt_tokens).toBeGreaterThan(0);
    });

    it("passes stream option to OpenAI", async () => {
      const asyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          // empty stream
        },
      };
      mockCreate.mockResolvedValueOnce(asyncIterable);

      const agent = new LLMAgent();
      const gen = agent.callStream({ prompt: "test" });
      let result = await gen.next();
      while (!result.done) {
        result = await gen.next();
      }

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
          stream_options: { include_usage: true },
        })
      );
    });
  });

  describe("getUsageSnapshot()", () => {
    it("reflects accumulated usage across calls", async () => {
      mockCreate
        .mockResolvedValueOnce(mockResponse("a", 100, 50))
        .mockResolvedValueOnce(mockResponse("b", 200, 80));
      const agent = new LLMAgent();
      await agent.call({ prompt: "first" });
      await agent.call({ prompt: "second" });

      const snapshot = agent.getUsageSnapshot();
      expect(snapshot.total_tokens).toBe(100 + 50 + 200 + 80);
      expect(snapshot.calls).toBe(2);
      expect(snapshot.errors).toBe(0);
      expect(snapshot.total_cost_usd).toBeGreaterThan(0);
    });
  });

  describe("getAgent() singleton", () => {
    it("returns an LLMAgent instance", () => {
      const agent = getAgent();
      expect(agent).toBeInstanceOf(LLMAgent);
    });

    it("returns the same instance on repeated calls", () => {
      const agent1 = getAgent();
      const agent2 = getAgent();
      expect(agent1).toBe(agent2);
    });
  });
});
