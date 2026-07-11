/**
 * The AI Insights Agent — answers natural-language questions about product
 * data, generates executive summaries, explains anomalies, and recommends
 * UX improvements. Every numeric claim is grounded in tool calls against the
 * real analytics engines (see tools.ts); prompts live in /prompts.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Database, Insight } from "../types.js";
import type { AiProvider } from "./provider.js";
import { buildAnalyticsTools } from "./tools.js";

export interface InsightsAgentOptions {
  projectName: string;
  /** Directory containing the prompt library (defaults to repo /prompts). */
  promptsDir?: string;
}

const FALLBACK_SYSTEM = `You are the AI analytics agent for {{projectName}}.
Answer product-analytics questions using ONLY the provided tools — never invent numbers.
Start with list_events to learn the taxonomy. Prefer specific engines (segment, run_funnel,
run_retention, user_journeys) over run_sql. Lead with the answer, then the evidence,
then recommended actions. Use markdown. Today is {{today}}.`;

export class InsightsAgent {
  constructor(
    private db: Database,
    private projectId: string,
    private ai: AiProvider,
    private opts: InsightsAgentOptions
  ) {}

  private prompt(name: string): string {
    const dir = this.opts.promptsDir ?? join(process.cwd(), "prompts");
    const file = join(dir, `${name}.md`);
    const raw = existsSync(file) ? readFileSync(file, "utf8") : FALLBACK_SYSTEM;
    return raw
      .replace(/\{\{projectName\}\}/g, this.opts.projectName)
      .replace(/\{\{today\}\}/g, new Date().toISOString().slice(0, 10));
  }

  /** "Why did signups decrease?" / "Show users who abandoned checkout." */
  async ask(question: string): Promise<Insight> {
    const bodyMd = await this.ai.runAgent({
      system: this.prompt("system"),
      prompt: question,
      tools: buildAnalyticsTools(this.db, this.projectId),
    });
    return this.persist({ kind: "answer", question, bodyMd, evidence: {} });
  }

  /** "Generate a weekly executive report." */
  async executiveSummary(periodDays = 7): Promise<Insight> {
    const bodyMd = await this.ai.runAgent({
      system: this.prompt("executive-summary"),
      prompt: `Generate the executive summary for the last ${periodDays} days. Follow the template exactly.`,
      tools: buildAnalyticsTools(this.db, this.projectId),
      maxTokens: 32000,
    });
    return this.persist({ kind: "summary", bodyMd, evidence: { periodDays } });
  }

  /** Explain anomaly findings produced by the AnomalyEngine. */
  async explainAnomalies(findings: unknown[]): Promise<Insight> {
    const bodyMd = await this.ai.runAgent({
      system: this.prompt("anomaly"),
      prompt: `These anomalies were detected:\n${JSON.stringify(findings, null, 2)}\n` +
        `Investigate the most severe ones: correlate with releases, experiments, segments, and journeys. Explain probable causes.`,
      tools: buildAnalyticsTools(this.db, this.projectId),
    });
    return this.persist({ kind: "anomaly", bodyMd, evidence: { findings }, severity: "warning" });
  }

  /** "Recommend UX improvements." */
  async recommend(area?: string): Promise<Insight> {
    const bodyMd = await this.ai.runAgent({
      system: this.prompt("ux-recommendations"),
      prompt: area
        ? `Recommend UX improvements for: ${area}. Ground every recommendation in funnel drop-offs, journey detours, or adoption gaps.`
        : "Analyze funnels, journeys, and adoption to recommend the 5 highest-impact UX improvements.",
      tools: buildAnalyticsTools(this.db, this.projectId),
    });
    return this.persist({ kind: "recommendation", bodyMd, evidence: { area } });
  }

  private async persist(insight: Insight): Promise<Insight> {
    await this.db.query(
      `INSERT INTO ai_insights (project_id, kind, question, body_md, evidence, severity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [this.projectId, insight.kind, insight.question ?? null, insight.bodyMd,
       JSON.stringify(insight.evidence), insight.severity ?? null]
    );
    return insight;
  }
}
