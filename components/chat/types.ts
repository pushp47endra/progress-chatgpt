export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  model?: string | null;
  optimizedPrompt?: string | null;
}
