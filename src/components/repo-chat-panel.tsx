"use client";

import { FormEvent, useState } from "react";

import { Button, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import type { ApiResponse } from "@/lib/api-response";
import { cn } from "@/lib/styles";

type ChatCitation = {
  path: string;
  reason: string;
};

type ChatResponseData = {
  answer: string;
  citations?: ChatCitation[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
};

type RepoChatPanelProps = {
  repoId: string;
};

export function RepoChatPanel({ repoId }: RepoChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const trimmedMessage = message.trim();
  const canSubmit = trimmedMessage.length > 0 && !isLoading;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const sentMessage = trimmedMessage;
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: sentMessage,
    };

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setMessage("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/repos/${repoId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: sentMessage }),
      });
      const payload = (await response.json()) as ApiResponse<ChatResponseData>;

      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Unable to get an answer. Try again." : payload.error.message);
        return;
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: payload.data.answer,
          citations: payload.data.citations ?? [],
        },
      ]);
    } catch {
      setError("Unable to get an answer. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="space-y-4">
      <CardHeader className="mb-0">
        <CardTitle>Repo chat</CardTitle>
        <CardDescription>Ask questions and get answers grounded in repository context.</CardDescription>
      </CardHeader>

      <div className="space-y-3" aria-live="polite">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            Ask a question about this repository to get started.
          </div>
        ) : (
          messages.map((chatMessage) => (
            <article
              className={cn(
                "rounded-lg border px-4 py-3 text-sm",
                chatMessage.role === "user"
                  ? "border-slate-300 bg-slate-950 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-900",
              )}
              key={chatMessage.id}
            >
              <p className="text-xs font-semibold uppercase text-current opacity-70">
                {chatMessage.role === "user" ? "You" : "Assistant"}
              </p>
              <p className="mt-1 leading-6">{chatMessage.content}</p>

              {chatMessage.role === "assistant" && chatMessage.citations?.length ? (
                <div className="mt-3 flex flex-wrap gap-2" aria-label="Citations">
                  {chatMessage.citations.map((citation) => (
                    <div
                      className="max-w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      key={`${chatMessage.id}-${citation.path}-${citation.reason}`}
                    >
                      <span className="block truncate font-medium text-slate-950">
                        {citation.path}
                      </span>
                      <span className="block leading-5">{citation.reason}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}

        {isLoading ? (
          <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            Thinking through the repo...
          </p>
        ) : null}

        {error ? (
          <p
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>

      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <textarea
          aria-label="Message"
          className="min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-500 focus:border-slate-950 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask about files, flows, or dependencies"
          value={message}
        />
        <Button className="sm:w-32 sm:self-end" disabled={!canSubmit} type="submit">
          {isLoading ? "Sending..." : "Send"}
        </Button>
      </form>
    </Card>
  );
}
