/**
 * AI provider abstraction (port). The Anthropic adapter is the default and
 * only built-in provider; additional providers can be added as adapters
 * without touching the insights agent.
 *
 * Models come from analytics.config.ts (default: claude-opus-4-8 for
 * analysis, claude-haiku-4-5 for cheap classification).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";

export interface AiToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;          // JSON Schema
  run: (input: any) => Promise<string>;
}

export interface AiProvider {
  /** One-shot completion (no tools). */
  complete(opts: { system: string; prompt: string; fast?: boolean }): Promise<string>;
  /** Agentic loop with tools; returns the final text answer. */
  runAgent(opts: { system: string; prompt: string; tools: AiToolSpec[]; maxTokens?: number }): Promise<string>;
}

export interface AnthropicProviderConfig {
  apiKey: string;
  model: string;        // e.g. "claude-opus-4-8"
  fastModel: string;    // e.g. "claude-haiku-4-5"
  maxTokens: number;
}

export class AnthropicProvider implements AiProvider {
  private client: Anthropic;

  constructor(private cfg: AnthropicProviderConfig) {
    this.client = new Anthropic({ apiKey: cfg.apiKey });
  }

  async complete({ system, prompt, fast = false }: { system: string; prompt: string; fast?: boolean }): Promise<string> {
    // Stream + finalMessage() so long reports never hit HTTP timeouts.
    const stream = this.client.messages.stream({
      model: fast ? this.cfg.fastModel : this.cfg.model,
      max_tokens: this.cfg.maxTokens,
      ...(fast ? {} : { thinking: { type: "adaptive" as const } }),
      system,
      messages: [{ role: "user", content: prompt }],
    });
    const message = await stream.finalMessage();
    return message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }

  async runAgent({ system, prompt, tools, maxTokens }: {
    system: string; prompt: string; tools: AiToolSpec[]; maxTokens?: number;
  }): Promise<string> {
    // The SDK tool runner drives the agentic loop: request → execute tools →
    // feed results back → repeat until the model stops calling tools.
    const runnerTools = tools.map((t) =>
      betaTool({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as any,
        run: async (input: unknown) => t.run(input),
      })
    );

    const finalMessage = await this.client.beta.messages.toolRunner({
      model: this.cfg.model,
      max_tokens: maxTokens ?? this.cfg.maxTokens,
      thinking: { type: "adaptive" },
      system,
      tools: runnerTools,
      messages: [{ role: "user", content: prompt }],
    });

    return finalMessage.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
}
