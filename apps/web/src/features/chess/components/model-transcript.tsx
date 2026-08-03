import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clipboard,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ModelAttemptTrace, ModelTurnTrace } from "../types";

interface ModelTranscriptProps {
  isThinking: boolean;
  turns: ModelTurnTrace[];
}

const formatTranscript = (turns: ModelTurnTrace[]): string =>
  turns
    .map(
      (turn, turnIndex) =>
        `TURN ${turnIndex + 1}\n\nSYSTEM\n${turn.systemPrompt}\n\n${turn.attempts
          .map((attempt) => {
            const diagnosis = getAttemptDiagnosis(attempt);
            return `ATTEMPT ${attempt.attempt}\n\nREQUEST\n${attempt.request}\n\nRESPONSE\n${attempt.response || "(no final text block returned)"}\n\nDIAGNOSIS\n${diagnosis.title}: ${diagnosis.description}\nStop reason: ${attempt.stopReason ?? "missing"}\nRaw stop reason: ${attempt.rawStopReason ?? "missing"}\nDuration: ${attempt.durationMs}ms\nContent types: ${formatContentTypes(attempt)}\nTokens: ${attempt.usage.output} output / ${attempt.usage.totalTokens} total\nReasoning: ${formatReasoning(attempt)}${attempt.errorMessage ? `\nProvider error: ${attempt.errorMessage}` : ""}`;
          })
          .join("\n\n")}`
    )
    .join("\n\n--------------------\n\n");

interface DiagnosisCopy {
  description: string;
  title: string;
}

const getAttemptDiagnosis = (attempt: ModelAttemptTrace): DiagnosisCopy => {
  if (attempt.diagnosis === "accepted") {
    return {
      description: `The model returned ${attempt.candidate}, and chess.js accepted it as legal.`,
      title: "Legal move accepted",
    };
  }
  if (attempt.diagnosis === "output_limit") {
    return {
      description: `The model reached the ${attempt.outputTokenLimit}-token output limit before emitting a final text answer.`,
      title: "Output limit reached",
    };
  }
  if (attempt.diagnosis === "thinking_only") {
    return {
      description:
        "The provider returned private reasoning content but no final text block containing the requested JSON.",
      title: "Reasoning without a final answer",
    };
  }
  if (attempt.diagnosis === "empty_response") {
    return {
      description:
        "The provider completed without returning either final text or reasoning content.",
      title: "Provider returned no content",
    };
  }
  if (attempt.diagnosis === "no_move_parsed") {
    return {
      description:
        "Text was returned, but it contained neither a JSON move value nor recognizable UCI notation.",
      title: "Could not parse a move",
    };
  }
  if (attempt.diagnosis === "illegal_move") {
    return {
      description: `The move ${attempt.candidate ?? "returned by the model"} was parsed successfully, but chess.js rejected it in this position.`,
      title: "Parsed move was illegal",
    };
  }
  if (attempt.diagnosis === "aborted") {
    return {
      description: "The provider request was aborted before it completed.",
      title: "Request aborted",
    };
  }
  return {
    description:
      attempt.errorMessage ??
      "The model provider returned an unspecified error.",
    title: "Provider request failed",
  };
};

const formatContentTypes = (attempt: ModelAttemptTrace): string => {
  const contentTypes = [...new Set(attempt.contentTypes)];
  return contentTypes.length > 0 ? contentTypes.join(" → ") : "none";
};

const formatReasoning = (attempt: ModelAttemptTrace): string => {
  if (attempt.usage.reasoning !== null) {
    return `${attempt.usage.reasoning} tokens`;
  }
  if (attempt.reasoningCharacters > 0) {
    return `${attempt.reasoningCharacters} characters (content hidden)`;
  }
  return "none reported";
};

const formatDuration = (durationMs: number): string => {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
};

const formatStopReason = (attempt: ModelAttemptTrace): string => {
  const stopReason = attempt.stopReason ?? "missing";
  if (attempt.rawStopReason && attempt.rawStopReason !== attempt.stopReason) {
    return `${stopReason} (${attempt.rawStopReason})`;
  }
  return stopReason;
};

const getTurnStatus = (
  turn: ModelTurnTrace,
  hasIllegalAttempt: boolean
): { isError: boolean; label: string } => {
  if (hasIllegalAttempt) {
    return { isError: true, label: "Retry recorded" };
  }
  if (turn.status === "request_error") {
    return { isError: true, label: "Request error" };
  }
  return { isError: false, label: "Accepted" };
};

export default function ModelTranscript({
  isThinking,
  turns,
}: ModelTranscriptProps) {
  const [copied, setCopied] = useState(false);

  const copyTranscript = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(formatTranscript(turns));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard permissions can be denied without affecting the match.
    }
  };

  return (
    <Card className="mt-4 overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-balance">LLM exchange</CardTitle>
            <p className="mt-1 text-pretty text-muted-foreground text-xs">
              Exact prompts, final-text responses, and provider diagnostics.
            </p>
          </div>
          <Button
            aria-label="Copy complete LLM exchange history"
            disabled={turns.length === 0}
            onClick={copyTranscript}
            size="icon"
            variant="ghost"
          >
            {copied ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <Clipboard className="size-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {turns.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <Bot className="mb-3 size-5 text-muted-foreground" />
            <p className="font-medium text-sm">
              {isThinking
                ? "Waiting for the first response"
                : "No exchange yet"}
            </p>
            <p className="mt-1 text-pretty text-muted-foreground text-xs">
              {isThinking
                ? "The request and response will appear when this turn completes."
                : "Move a white piece to send the first position."}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {turns.map((turn, turnIndex) => {
              const hasIllegalAttempt = turn.attempts.some(
                (attempt) => !attempt.isLegal
              );
              const isLatestTurn = turnIndex === turns.length - 1;
              const turnStatus = getTurnStatus(turn, hasIllegalAttempt);
              return (
                <details
                  className="group"
                  key={turn.id}
                  open={isLatestTurn || hasIllegalAttempt}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                    <span className="font-medium text-sm tabular-nums">
                      Model turn {turnIndex + 1}
                    </span>
                    <span className="flex items-center gap-2 text-xs tabular-nums">
                      <span
                        className={cn(
                          "flex items-center gap-1",
                          turnStatus.isError
                            ? "text-destructive"
                            : "text-muted-foreground"
                        )}
                      >
                        {turnStatus.isError ? (
                          <XCircle className="size-3.5" />
                        ) : (
                          <CheckCircle2 className="size-3.5" />
                        )}
                        {turnStatus.label}
                      </span>
                      <span aria-hidden="true" className="group-open:rotate-90">
                        ›
                      </span>
                    </span>
                  </summary>
                  <div className="space-y-4 border-t bg-muted/20 p-4">
                    <section>
                      <h3 className="mb-2 font-medium text-xs uppercase">
                        System prompt
                      </h3>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-pretty border bg-background p-3 font-mono text-xs">
                        {turn.systemPrompt}
                      </pre>
                    </section>
                    {turn.attempts.map((attempt) => {
                      const diagnosis = getAttemptDiagnosis(attempt);
                      return (
                        <section className="space-y-3" key={attempt.attempt}>
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="font-medium text-xs uppercase tabular-nums">
                              Attempt {attempt.attempt}
                            </h3>
                            <span
                              className={cn(
                                "text-xs",
                                attempt.isLegal
                                  ? "text-muted-foreground"
                                  : "text-destructive"
                              )}
                            >
                              {diagnosis.title}
                            </span>
                          </div>
                          <div
                            className={cn(
                              "border p-3",
                              attempt.isLegal
                                ? "bg-background"
                                : "border-destructive/40 bg-destructive/10"
                            )}
                          >
                            <div className="flex items-start gap-2">
                              {attempt.isLegal ? (
                                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                              )}
                              <div>
                                <p className="font-medium text-sm">
                                  {diagnosis.title}
                                </p>
                                <p className="mt-1 text-pretty text-muted-foreground text-xs">
                                  {diagnosis.description}
                                </p>
                              </div>
                            </div>
                            <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs tabular-nums sm:grid-cols-4">
                              <div>
                                <dt className="text-muted-foreground">Stop</dt>
                                <dd className="mt-1 font-mono">
                                  {formatStopReason(attempt)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Latency
                                </dt>
                                <dd className="mt-1 font-mono">
                                  {formatDuration(attempt.durationMs)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Output
                                </dt>
                                <dd className="mt-1 font-mono">
                                  {attempt.usage.output} /{" "}
                                  {attempt.outputTokenLimit} tokens
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  Content
                                </dt>
                                <dd className="mt-1 font-mono">
                                  {formatContentTypes(attempt)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Input</dt>
                                <dd className="mt-1 font-mono">
                                  {attempt.usage.input} tokens
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Total</dt>
                                <dd className="mt-1 font-mono">
                                  {attempt.usage.totalTokens} tokens
                                </dd>
                              </div>
                              <div className="col-span-2">
                                <dt className="text-muted-foreground">
                                  Private reasoning
                                </dt>
                                <dd className="mt-1 font-mono">
                                  {formatReasoning(attempt)}
                                </dd>
                              </div>
                            </dl>
                            {attempt.errorMessage ? (
                              <div className="mt-3 border-t pt-3">
                                <p className="text-muted-foreground text-xs">
                                  Provider error
                                </p>
                                <p className="mt-1 break-words font-mono text-destructive text-xs">
                                  {attempt.errorMessage}
                                </p>
                              </div>
                            ) : null}
                          </div>
                          <div className="grid gap-3 xl:grid-cols-2">
                            <div>
                              <p className="mb-2 text-muted-foreground text-xs">
                                Request
                              </p>
                              <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-pretty border bg-background p-3 font-mono text-xs">
                                {attempt.request}
                              </pre>
                            </div>
                            <div>
                              <p className="mb-2 text-muted-foreground text-xs">
                                Final text response
                              </p>
                              <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-pretty border bg-background p-3 font-mono text-xs">
                                {attempt.response ||
                                  "(no final text block returned)"}
                              </pre>
                            </div>
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
