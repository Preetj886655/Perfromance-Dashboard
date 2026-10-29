import React, { useState, useEffect, useRef } from "react";
import type { FilterState } from "../../data/filters/dashboardFilterEngine";
import { sendChatMessage, type ChatMessage } from "../../services/chatApi";

export interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
}

const STARTER_PROMPTS = [
  "What is the total production this month?",
  "What is the production achievement percentage?",
  "Which line has the largest production gap?",
  "What are the top five downtime causes?",
  "Which machines have the highest downtime?",
  "Compare day shift and night shift.",
  "What is the rejection rate for the selected period?",
  "What are the main maintenance breakdown causes in Medchal?",
  "Which breakdown records have corrective-action information?",
  "Summarize the main operational problems in the selected date range.",
];

export const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose, filters }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestVersionRef = useRef(0);

  // Auto-scroll on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    } else {
      requestVersionRef.current += 1;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputValue).trim();
    if (!query || isLoading) return;

    setError(null);
    setInputValue("");

    const userMsg: ChatMessage = {
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setIsLoading(true);
    const requestVersion = ++requestVersionRef.current;

    try {
      const response = await sendChatMessage({
        message: query,
        conversation_id: conversationId,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
        filters: {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          line: filters.line,
          shift: filters.shift,
          stage: filters.stage,
          machine: filters.machine,
          material: filters.material,
        },
      });

      if (requestVersion !== requestVersionRef.current) return;

      setConversationId(response.conversation_id);

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response.response,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        suggestedQuestions: response.suggested_questions,
        dataUsed: response.data_used,
      };

      setMessages([...nextMessages, assistantMsg]);
    } catch (err: unknown) {
      if (requestVersion !== requestVersionRef.current) return;
      const msg = err instanceof Error ? err.message : "Failed to get AI response";
      setError(msg);
    } finally {
      if (requestVersion === requestVersionRef.current) setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const handleClearChat = () => {
    requestVersionRef.current += 1;
    setMessages([]);
    setConversationId(undefined);
    setError(null);
  };

  const handleClose = () => {
    requestVersionRef.current += 1;
    onClose();
  };

  // Safe markdown line renderer
  const renderFormattedMarkdown = (content: string) => {
    const lines = content.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();

      // Heading 3
      if (trimmed.startsWith("### ")) {
        return <h3 key={idx}>{trimmed.replace("### ", "")}</h3>;
      }
      // Heading 4
      if (trimmed.startsWith("#### ")) {
        return <h4 key={idx}>{trimmed.replace("#### ", "")}</h4>;
      }
      // Bullet point
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const text = trimmed.substring(2);
        return (
          <li key={idx}>{formatInlineMarkdown(text)}</li>
        );
      }
      // Empty line
      if (trimmed === "") {
        return <div key={idx} style={{ height: "6px" }} />;
      }
      // Paragraph
      return (
        <p key={idx}>{formatInlineMarkdown(trimmed)}</p>
      );
    });
  };

  const formatInlineMarkdown = (text: string): React.ReactNode => {
    const tokens = text.split(/(\*\*.*?\*\*|\*.*?\*|`[^`]+`)/g);
    return tokens.map((token, index) => {
      if (token.startsWith("**") && token.endsWith("**")) {
        return <strong key={index}>{token.slice(2, -2)}</strong>;
      }
      if (token.startsWith("*") && token.endsWith("*")) {
        return <em key={index}>{token.slice(1, -1)}</em>;
      }
      if (token.startsWith("`") && token.endsWith("`")) {
        return <code key={index}>{token.slice(1, -1)}</code>;
      }
      return token;
    });
  };

  const activeDateDisplay =
    filters.dateFrom && filters.dateTo
      ? `${filters.dateFrom} → ${filters.dateTo}`
      : "Full Dataset";

  return (
    <div className="chat-panel-overlay" role="dialog" aria-label="Manufacturing AI Assistant">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header__title-group">
          <div className="chat-header__avatar">P</div>
          <div className="chat-header__text">
            <h3 className="chat-header__title">
              Patil AI Assistant
            </h3>
            <span className="chat-header__subtitle">Manufacturing & Maintenance Intelligence</span>
          </div>
        </div>
        <div className="chat-header__actions">
          {messages.length > 0 && (
            <button
              type="button"
              className="chat-header__btn"
              onClick={handleClearChat}
              title="Clear conversation"
              aria-label="Clear chat"
            >
              🗑
            </button>
          )}
          <button
            type="button"
            className="chat-header__btn"
            onClick={handleClose}
            title="Close assistant"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Filter Context Bar */}
      <div className="chat-context-strip">
        <span
          className="chat-context-strip__pill"
          title={`Active context: ${activeDateDisplay} | ${filters.line}`}
        >
          📅 {activeDateDisplay} | {filters.line}
        </span>
        <span className="chat-context-strip__badge">● Grounded Data</span>
      </div>

      {/* Message Stream */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <div className="chat-welcome__icon">🤖</div>
            <h4 className="chat-welcome__title">How can I help you today?</h4>
            <p className="chat-welcome__desc">
              Ask questions about production volumes, targets, downtime bottlenecks, shifts, or Medchal
              maintenance breakdowns.
            </p>
            <div className="chat-suggestions" style={{ width: "100%", marginTop: "12px" }}>
              <span className="chat-suggestions__label">Quick Questions:</span>
              <div className="chat-suggestions__list">
                {STARTER_PROMPTS.slice(0, 6).map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="chat-chip"
                    onClick={() => void handleSendMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`chat-bubble chat-bubble--${msg.role}`}
            >
              <div className="chat-bubble__content chat-markdown">
                {renderFormattedMarkdown(msg.content)}
              </div>
              {msg.timestamp && (
                <div className="chat-bubble__meta">{msg.timestamp}</div>
              )}

              {/* Follow-up question chips */}
              {msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                <div className="chat-suggestions">
                  <span className="chat-suggestions__label">Suggested Follow-ups:</span>
                  <div className="chat-suggestions__list">
                    {msg.suggestedQuestions.map((q, qIdx) => (
                      <button
                        key={qIdx}
                        type="button"
                        className="chat-chip"
                        onClick={() => void handleSendMessage(q)}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="chat-bubble chat-bubble--assistant">
            <div className="chat-typing">
              <span className="chat-typing__dot" />
              <span className="chat-typing__dot" />
              <span className="chat-typing__dot" />
            </div>
          </div>
        )}

        {error && (
          <div className="chat-error-banner" role="alert">
            <span>{error}</span>
            <button
              type="button"
              className="chat-chip"
              style={{ padding: "2px 8px" }}
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="chat-input-bar">
        <textarea
          ref={textareaRef}
          className="chat-input-bar__textarea"
          placeholder="Ask a manufacturing or maintenance question..."
          rows={1}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          type="button"
          className="chat-input-bar__send"
          onClick={() => void handleSendMessage()}
          disabled={isLoading || !inputValue.trim()}
          title="Send message (Enter)"
          aria-label="Send"
        >
          ➤
        </button>
      </div>
    </div>
  );
};

