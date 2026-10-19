import React from "react";

export interface ChatButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export const ChatButton: React.FC<ChatButtonProps> = ({ isOpen, onClick }) => {
  if (isOpen) return null;

  return (
    <button
      type="button"
      className="chat-fab"
      onClick={onClick}
      aria-label="Open Manufacturing AI Assistant"
      title="Ask questions about production, downtime, and maintenance"
    >
      <span className="chat-fab__icon">✨</span>
      <span>Ask AI</span>
      <span className="chat-fab__badge">LIVE</span>
    </button>
  );
};

