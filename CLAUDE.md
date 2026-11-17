# CLAUDE.md — Pago Voice (hackathon memory)

This file is my persistent context for this project. Read it at the start of every session.

## Project

**Pago Voice** is an AI payment assistant. Users talk or type to it to check bills, open invoices, and pay through a cart and checkout flow. This is a hackathon project built by team Pago.

## Stack

- **Next.js App Router** (version 16, `app/` directory). Route handlers live in `app/api/*/route.ts`. Read `node_modules/next/dist/docs/` before writing Next.js code, because this version has breaking changes (see `AGENTS.md`).
- **React 19** with TypeScript.
- **Tailwind CSS 4** (`tailwindcss` with `@tailwindcss/turbopack`).
- **Framer Motion** (`framer-motion`) for animations.
- AI providers: Gemini (`@google/genai`), plus Anthropic and OpenAI SDKs in dependencies. Keys live in `.env.local` (see `.env.example`). Never commit keys.

## Voice intents — strict rule

**All voice intents are strictly mapped in `lib/assistant/intents.ts`.**

- Add, change, or remove an intent only in that file. Do not hard-code intent keywords or matching logic anywhere else.
- Each intent has a name (`IntentName`), keywords (plain strings or RegExp), and an optional `local: true` flag.
- `local: true` intents (cart, checkout, invoice actions) must be handled locally and never sent to the AI endpoint, because they must always change app state.
- Entries are checked in order and the first match wins. Put more specific intents first.

## Key paths

- `lib/assistant/` — assistant logic: intents, commands, bills, invoices, bill history, prompt, types.
- `lib/voice/` — speech recognition and the voice controller.
- `lib/chat/` — chat/AI provider code (Gemini, assistant).
- `app/api/chat/route.ts`, `app/api/tts/route.ts` — API routes.
- `components/assistant/` — assistant UI, checkout, invoice viewer.
- `components/voice/` — voice overlay.
- `components/home/` — home screen.

## Commands

- `npm run dev` — dev server.
- `npm run lint` — ESLint.
- `npm run typecheck` — TypeScript check without emit.
- `npm run build` — production build.
- `npm run ai-check` — lint then build. Run this after code changes and fix any errors it reports before finishing a task.

Node 22 is required. On this machine, run it with `fnm use 22` first.

## Working rules

- Work on a feature branch, never directly on `main`.
- Keep changes small and in the existing style of each folder.
- Run `npm run ai-check` after changes and fix failures before reporting done.
- Report what was verified and what was not.
