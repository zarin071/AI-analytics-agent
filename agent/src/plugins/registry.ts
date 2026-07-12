/**
 * Plugin registry — loads plugins named in analytics.config.ts → connectors[]
 * and dispatches lifecycle hooks. Failures in one plugin never break the
 * pipeline or other plugins (isolated try/catch, logged).
 */
import type { StoredEvent, Insight } from "../types.js";
import type { AnalyticsPlugin, PluginContext } from "./plugin.js";
import type { AiToolSpec } from "../ai/provider.js";

export class PluginRegistry {
  private plugins: { plugin: AnalyticsPlugin; ctx: PluginContext }[] = [];

  async register(plugin: AnalyticsPlugin, ctx: PluginContext): Promise<void> {
    await plugin.setup?.(ctx);
    this.plugins.push({ plugin, ctx });
    ctx.log(`plugin registered: ${plugin.name}@${plugin.version}`);
  }

  async beforeStore(event: StoredEvent): Promise<StoredEvent | null> {
    let current: StoredEvent | null = event;
    for (const { plugin, ctx } of this.plugins) {
      if (!current || !plugin.beforeStore) continue;
      try {
        current = await plugin.beforeStore(current, ctx);
      } catch (err) {
        ctx.log(`plugin ${plugin.name} beforeStore failed`, { err: String(err) });
      }
    }
    return current;
  }

  onEvent(event: StoredEvent): void {
    for (const { plugin, ctx } of this.plugins) {
      if (!plugin.onEvent) continue;
      Promise.resolve(plugin.onEvent(event, ctx)).catch((err) =>
        ctx.log(`plugin ${plugin.name} onEvent failed`, { err: String(err) })
      );
    }
  }

  onInsight(insight: Insight): void {
    for (const { plugin, ctx } of this.plugins) {
      if (!plugin.onInsight) continue;
      Promise.resolve(plugin.onInsight(insight, ctx)).catch((err) =>
        ctx.log(`plugin ${plugin.name} onInsight failed`, { err: String(err) })
      );
    }
  }

  aiTools(): AiToolSpec[] {
    return this.plugins.flatMap(({ plugin, ctx }) => plugin.aiTools?.(ctx) ?? []);
  }

  jobs() {
    return this.plugins.flatMap(({ plugin, ctx }) => plugin.jobs?.(ctx) ?? []);
  }
}
