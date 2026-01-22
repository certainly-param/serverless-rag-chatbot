import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";
import { google } from "@ai-sdk/google";

import { getRedis, getVectorIndex } from "@/lib/upstash";
import { queryDocs } from "@/lib/retrieval";

export const runtime = "edge";

// Configurable model: default to 2.5 Flash (free tier compatible, better quality)
// Options: "gemini-2.5-flash" (default, free tier, 10 RPM/250 RPD), "gemini-2.5-flash-lite" (free tier, 15 RPM/1,000 RPD), "gemini-2.0-flash-lite" (free tier, 30 RPM), "gemini-2.5-pro" (best quality, higher cost)
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function POST(req: Request) {
  const body = (await req.json()) as { messages?: unknown[] };
  const { messages } = body;

  // AI SDK v6 messages can have content as string, parts array, or content array
  const last = messages?.[messages.length - 1] as 
    | { 
        role?: string; 
        content?: string | Array<{ type?: string; text?: string }>;
        parts?: Array<{ type?: string; text?: string }>;
      }
    | undefined;
  
  let query = "";
  if (last) {
    // Try parts first (AI SDK v6 format)
    if (Array.isArray(last.parts)) {
      query = last.parts
        .filter((part) => part?.type === "text" && part?.text)
        .map((part) => part.text)
        .join(" ");
    }
    // Fallback to content (string)
    else if (typeof last.content === "string") {
      query = last.content;
    }
    // Fallback to content (array)
    else if (Array.isArray(last.content)) {
      query = last.content
        .map((part) => (typeof part === "object" && part?.text ? part.text : ""))
        .join(" ");
    }
  }

  let index;
  try {
    index = getVectorIndex();
  } catch (error) {
    throw error;
  }
  
  let retrieved: Awaited<ReturnType<typeof queryDocs>> = [];
  
  if (query) {
    try {
      // Enhance query for author/metadata questions to improve retrieval
      const isAuthorQuery = /author|writer|creator|researcher|paper|document|title|abstract/i.test(query);
      const enhancedQuery = isAuthorQuery 
        ? `${query} authors names researchers contributors paper title abstract`
        : query;
      
      // Retrieve more chunks for better coverage, especially for metadata queries like "authors"
      retrieved = await queryDocs(index, enhancedQuery, 8);
      
      // Fallback: if no results, try a broader search with the original query
      if (retrieved.length === 0) {
        retrieved = await queryDocs(index, query, 10);
      }
    } catch (error) {
      // Continue with empty retrieved - fallback will try again
    }
  }
  
  // Last resort: try to get any document chunks (very broad search)
  if (retrieved.length === 0 && query) {
    try {
      // Try multiple broad queries to find any document content
      // Using Upstash's built-in embedding via `data` parameter
      const broadQueries = ["document", "text content", "paper", "pdf content"];
      for (const broadQuery of broadQueries) {
        const result = await index.query<{ type?: string; text?: string; source?: string; page?: number }>({
          data: broadQuery, // Upstash embeds this automatically
          topK: 10,
          includeMetadata: true,
        });
        
        const candidates = (result ?? [])
          .filter((r) => {
            const type = r.metadata?.type;
            return type === "doc" || type === undefined;
          })
          .filter((r) => r.metadata?.text && r.metadata.text.length > 0)
          .map((r) => ({
            id: String(r.id),
            score: r.score,
            text: r.metadata?.text ?? "",
            source: r.metadata?.source,
            page: r.metadata?.page,
          }));
        
        if (candidates.length > 0) {
          retrieved = candidates;
          break; // Found some results, use them
        }
      }
    } catch (error) {
      // Ignore errors in last-resort search
    }
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Stream citations first for UX/transparency (custom data part)
      writer.write({
        type: "data-citations",
        id: "citations",
        data: {
          sources: retrieved.map((d) => ({
            id: d.id,
            source: d.source ?? "unknown",
            page: d.page ?? null,
            score: d.score,
          })),
        },
      });

      const system = [
        "You are a helpful assistant that answers questions based on the provided context from uploaded documents.",
        "The user has uploaded a document (PDF) and is asking questions about it. Use the context below to answer.",
        "",
        "Critical instructions:",
        "- ALWAYS use the provided context to answer. The user has uploaded a document, so the information exists.",
        "- Extract information from the context, even if it's partial, incomplete, or not perfectly formatted.",
        "- For questions about 'authors', 'title', 'abstract', or metadata, carefully examine ALL provided context chunks.",
        "- Look for names, titles, and metadata in the context - they may appear in various formats.",
        "- If you see ANY relevant information in the context, use it to answer. Do NOT say you don't have the document.",
        "- Only say 'I cannot find that information' if you've thoroughly checked all context and truly cannot find it.",
        "- When you use the context, cite sources by listing them at the end under 'Sources:' with (source, page) pairs.",
        "",
        retrieved.length > 0
          ? `Context from the uploaded document (${retrieved.length} chunks retrieved):\n\n${retrieved
              .map((c, i) => {
                const header = `[Chunk ${i + 1}] source=${c.source ?? "unknown"} page=${c.page ?? "n/a"} (relevance: ${c.score.toFixed(3)})`;
                return `${header}\n${c.text}`;
              })
              .join("\n\n")}\n\nIMPORTANT: You MUST use this context to answer the user's question. The document was uploaded and processed (86 vectors were created). Even if the context seems incomplete, extract and provide any relevant information you find.`
          : "CRITICAL: No context chunks were retrieved, but the user has uploaded a PDF document (86 vectors were created). This indicates a retrieval issue. However, you should still try to answer based on the conversation. If the user asks about accessing the PDF, explain that the document was uploaded and processed, but there may be a temporary retrieval issue. Ask them to try re-uploading or rephrasing their question.",
      ].join("\n");

      const result = streamText({
        model: google(GEMINI_MODEL),
        messages: await convertToModelMessages(messages as Parameters<typeof convertToModelMessages>[0]),
        system,
        onFinish: async ({ text }) => {
          if (!query || !text) return;

          try {
            const redis = getRedis();
            const cacheId = crypto.randomUUID();
            const redisKey = `cache:${cacheId}`;

            await redis.set(redisKey, {
              query,
              text,
              citations: retrieved.map((d) => ({
                id: d.id,
                source: d.source ?? "unknown",
                page: d.page ?? null,
                score: d.score,
              })),
            });

            // Use Upstash's built-in embedding via `data` parameter
            await index.upsert({
              id: `cache:${cacheId}`,
              data: query, // Upstash will embed this automatically
              metadata: { type: "cache", redisKey },
            });
          } catch {
            // Best-effort caching; ignore failures.
          }
        },
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}

