import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, Send, Sparkles } from "lucide-react";
import { AI_ASSISTANT_DISCLAIMER } from "@breastcare/shared";
import { api, errorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHead } from "@/components/ui/Card";
import { Callout, DisclaimerCard, EmptyState, PageHeader } from "@/components/ui/Feedback";
import { Field, Select, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

interface AssistantAnswer {
  answer: string;
  sources: { title: string; slug: string }[];
  refused: boolean;
  escalation: string | null;
  disclaimer: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: { title: string; slug: string }[];
  refused?: boolean;
  escalation?: string | null;
}

const CONTEXTS = [
  { value: "general", label: "General" },
  { value: "terminology", label: "Medical terminology" },
  { value: "nutrition", label: "Nutrition" },
  { value: "treatment", label: "Treatment" },
  { value: "appointments", label: "Appointments" },
  { value: "symptoms", label: "Symptoms" },
] as const;

const SUGGESTIONS = [
  "What does 'triple negative' mean?",
  "How can I manage nausea during chemotherapy?",
  "What should I ask at my next appointment?",
  "What foods are worth including during treatment?",
];

export function AssistantPage() {
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState<(typeof CONTEXTS)[number]["value"]>("general");
  const [messages, setMessages] = useState<Message[]>([]);

  const ask = useMutation({
    mutationFn: (payload: { question: string; context: string }) => api.post<AssistantAnswer>("/assistant", payload),
    onSuccess: (answer, payload) => {
      setMessages((previous) => [
        ...previous,
        { id: `q-${Date.now()}`, role: "user", text: payload.question },
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: answer.answer,
          sources: answer.sources,
          refused: answer.refused,
          escalation: answer.escalation,
        },
      ]);
      setQuestion("");
    },
    onError: (error) => {
      setMessages((previous) => [
        ...previous,
        { id: `e-${Date.now()}`, role: "assistant", text: `I couldn't answer that: ${errorMessage(error)}` },
      ]);
    },
  });

  function submit(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 4) return;
    ask.mutate({ question: trimmed, context });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Assistant"
        description="An educational assistant that answers only from the platform's knowledge base. It cannot diagnose, prescribe, or change a treatment plan."
      />

      <Callout tone="warning" title="What this assistant will not do">
        <ul className="space-y-1">
          <li>• It will not tell you whether you have cancer.</li>
          <li>• It will not recommend a treatment or a medicine.</li>
          <li>• It will not change a dosage or suggest stopping anything.</li>
          <li>• If you describe something urgent, it will tell you to seek clinical care.</li>
        </ul>
      </Callout>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="flex min-h-[520px] flex-col">
          <CardHead title="Conversation" description="Your questions are not written to the audit trail." />
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto pr-1">
              {messages.length === 0 ? (
                <EmptyState
                  title="Ask a question"
                  description="Try one of the suggestions, or ask about terminology, nutrition, treatment vocabulary or preparing for an appointment."
                  icon={<Sparkles className="size-5" />}
                />
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "rounded-lg border px-4 py-3",
                      message.role === "user" ? "ml-8 border-primary/30 bg-primary/5" : "mr-8",
                    )}
                  >
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {message.role === "user" ? "You" : "Assistant"}
                    </p>
                    <p className="whitespace-pre-line text-sm">{message.text}</p>

                    {message.escalation ? (
                      <p className="mt-2 flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        {message.escalation}
                      </p>
                    ) : null}

                    {message.sources?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.sources.map((source) => (
                          <Link key={source.slug} to={`/app/knowledge?article=${source.slug}`}>
                            <Badge tone="accent">
                              <BookOpen className="size-3" /> {source.title}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}

              {ask.isPending ? (
                <div className="mr-8 rounded-lg border px-4 py-3">
                  <p className="text-sm text-muted-foreground">Thinking…</p>
                </div>
              ) : null}
            </div>

            <div className="space-y-3 border-t pt-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                <Field label="Your question" htmlFor="question" className="sm:col-span-1">
                  <Textarea
                    id="question"
                    rows={3}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(question);
                    }}
                    placeholder="Ask about a term, a side effect, or how to prepare for an appointment…"
                  />
                </Field>
                <Field label="Topic" htmlFor="context">
                  <Select id="context" value={context} onChange={(event) => setContext(event.target.value as typeof context)}>
                    {CONTEXTS.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => submit(question)} loading={ask.isPending} disabled={question.trim().length < 4}>
                  <Send className="size-4" /> Ask
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHead title="Try one of these" />
            <CardContent className="space-y-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setQuestion(suggestion);
                    submit(suggestion);
                  }}
                  className="w-full rounded-md border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </CardContent>
          </Card>

          <DisclaimerCard title="AI assistant disclaimer" body={AI_ASSISTANT_DISCLAIMER} />
        </div>
      </div>
    </div>
  );
}
