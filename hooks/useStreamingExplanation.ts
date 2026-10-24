"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { isExplanation, type Explanation } from "@/lib/types";

type ExplainRequest = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  context?: string;
  youtubeId?: string;
  lineIndex?: number;
};

type StreamEvent = {
  type?: unknown;
  text?: unknown;
  explanation?: unknown;
};

function readPartialString(source: string, key: string): string | undefined {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`, "g");
  let match: RegExpExecArray | null = null;
  for (let candidate = pattern.exec(source); candidate; candidate = pattern.exec(source)) {
    let precedingSlashes = 0;
    for (let index = candidate.index - 1; index >= 0 && source[index] === "\\"; index -= 1) precedingSlashes += 1;
    if (precedingSlashes % 2 === 0) {
      match = candidate;
      break;
    }
  }
  if (!match) return undefined;

  const encoded = match[1];
  let value = "";
  for (let index = 0; index < encoded.length; index += 1) {
    const character = encoded[index];
    if (character !== "\\") {
      value += character;
      continue;
    }

    const escaped = encoded[++index];
    if (escaped === undefined) break;
    if (escaped === "u") {
      const hex = encoded.slice(index + 1, index + 5);
      if (!/^[\da-f]{4}$/i.test(hex)) break;
      value += String.fromCharCode(Number.parseInt(hex, 16));
      index += 4;
      continue;
    }
    const escapes: Record<string, string> = {
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    };
    if (!(escaped in escapes)) break;
    value += escapes[escaped];
  }
  return value;
}

function parsePartialExplanation(source: string): Partial<Explanation> {
  return {
    translation: readPartialString(source, "translation"),
    grammar: readPartialString(source, "grammar"),
    slang: readPartialString(source, "slang"),
  };
}

export function useStreamingExplanation() {
  const { t } = useLanguage();

  return useCallback(async (
    input: ExplainRequest,
    onPartial: (data: Partial<Explanation>) => void,
  ): Promise<Explanation> => {
    const response = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      try {
        await response.json();
      } catch {
        throw new Error(t("explain.serverNonJson", { status: response.status }));
      }
      throw new Error(t("explain.requestError"));
    }

    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
      let result: unknown;
      try {
        result = await response.json();
      } catch {
        throw new Error(t("explain.serverNonJson", { status: response.status }));
      }
      if (!isExplanation(result)) throw new Error(t("explain.requestError"));
      onPartial(result);
      return result;
    }

    if (!response.body) throw new Error(t("explain.requestError"));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamedText = "";
    let explanation: Explanation | null = null;

    function processEvent(block: string) {
      let eventType = "";
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length === 0) return;

      let event: StreamEvent;
      try {
        event = JSON.parse(data.join("\n")) as StreamEvent;
      } catch {
        throw new Error(t("explain.requestError"));
      }

      if (eventType === "chunk" && typeof event.text === "string") {
        streamedText += event.text;
        onPartial(parsePartialExplanation(streamedText));
      } else if (eventType === "done") {
        if (!isExplanation(event.explanation)) throw new Error(t("explain.requestError"));
        explanation = event.explanation;
      } else if (eventType === "error") {
        throw new Error(t("explain.requestError"));
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) processEvent(block);
        if (done) break;
      }
      if (buffer.trim()) processEvent(buffer);
    } finally {
      reader.releaseLock();
    }

    if (!explanation) throw new Error(t("explain.requestError"));
    return explanation;
  }, [t]);
}
