/**
 * Organism: AI Chat — the conversational interface to the insights agent.
 * Sends questions to POST /v1/ai/ask and renders markdown answers with
 * their evidence (tool calls the agent made).
 */
import { useState, useRef, useEffect } from "react";

interface ChatMessage { role: "user" | "assistant"; content: string; pending?: boolean }

const SUGGESTIONS = [
  "Why did signups decrease?",
  "Show users who abandoned checkout.",
  "What changed after release 2.0?",
  "Generate a weekly executive report.",
  "Recommend UX improvements.",
];

export function AiChat({ ask }: { ask: (question: string) => Promise<{ bodyMd: string }> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  async function submit(question: string) {
    if (!question.trim()) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "Analyzing…", pending: true }]);
    try {
      const insight = await ask(question);
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: insight.bodyMd }]);
    } catch (err) {
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: `Something went wrong: ${String(err)}` }]);
    }
  }

  return (
    <div className="ai-chat">
      <div className="ai-chat__messages">
        {messages.length === 0 && (
          <div className="ai-chat__empty">
            <p>Ask anything about your product data.</p>
            <div className="ai-chat__suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => void submit(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`ai-chat__msg ai-chat__msg--${msg.role} ${msg.pending ? "is-pending" : ""}`}>
            {/* Markdown rendering: plug in your renderer of choice; kept dependency-free here. */}
            <pre className="ai-chat__body">{msg.content}</pre>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="ai-chat__composer" onSubmit={(e) => { e.preventDefault(); void submit(input); }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Why did retention drop for mobile users?"
          aria-label="Ask the AI agent"
        />
        <button type="submit" disabled={!input.trim()}>Ask</button>
      </form>
    </div>
  );
}
