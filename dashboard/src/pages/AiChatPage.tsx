import { AiChat } from "../components/organisms/AiChat.js";
import { api } from "../lib/api.js";

export default function AiChatPage() {
  return (
    <section className="page">
      <header className="page__header">
        <h1>AI Chat</h1>
        <p className="page__subtitle">Every answer is grounded in real queries against your data.</p>
      </header>
      <AiChat ask={api.ask} />
    </section>
  );
}
