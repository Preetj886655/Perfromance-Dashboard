/**
 * AI Chatbot frontend API client.
 * Calls backend /api/v1/chat with JWT authentication and active filter context.
 */

import { apiPost } from "../api/client";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id?: string;
  role: ChatRole;
  content: string;
  timestamp?: string;
  suggestedQuestions?: string[];
  dataUsed?: Record<string, unknown>;
};

export type ChatFilterContext = {
  dateFrom?: string;
  dateTo?: string;
  line?: string;
  shift?: string;
  stage?: string;
  machine?: string;
  material?: string;
};

export type ChatRequest = {
  message: string;
  conversation_id?: string;
  history?: Array<{ role: string; content: string }>;
  filters?: ChatFilterContext;
};

export type ChatResponse = {
  response: string;
  conversation_id: string;
  data_used: Record<string, unknown>;
  suggested_questions: string[];
};

export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  return apiPost<ChatResponse>("/api/v1/chat", request as unknown as Record<string, unknown>);
}

