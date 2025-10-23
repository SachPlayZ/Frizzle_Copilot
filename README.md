# Frizzle – CopilotKit + LangGraph App

Frizzle is a Next.js app that pairs a LangGraph agent (Python) with a CopilotKit-powered UI for collaborative planning. The UI renders structured JSON (itineraries, checklists) as rich components, and the agent uses LangGraph with Google Gemini tools.

## Prerequisites

- Node.js 18+
- Python 3.8+
- Any of the following package managers:
  - [pnpm](https://pnpm.io/installation) (recommended)
  - npm
  - [yarn](https://classic.yarnpkg.com/lang/en/docs/install/#mac-stable)
  - [bun](https://bun.sh/)
- Google Gemini API Key (for the LangGraph agent)
- Google OAuth credentials (for NextAuth)

> **Note:** This repository ignores lock files (package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb) to avoid conflicts between different package managers. Each developer should generate their own lock file using their preferred package manager. After that, make sure to delete it from the .gitignore.

## Environment Variables

Create a `.env.local` in the project root for the web app and an `agent/.env` for the agent.

Web (.env.local):

```bash
# NextAuth / Google OAuth
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret

# Optional: Prisma database (if you later switch providers)
DATABASE_URL=file:./dev.db

# Socket path configuration (defaults OK)
# NEXT_PUBLIC_SOCKET_PATH=/api/socket_io
```

Agent (agent/.env):

```bash
# Google Gemini (LangGraph agent)
GOOGLE_API_KEY=your-google-api-key-here
# or GEMINI_API_KEY=your-google-api-key-here

# Optional model override
# GEMINI_MODEL=gemini-2.5-flash
# MODEL_NAME=gemini-2.5-flash

# Optional: OpenTripMap for real activities
# OPENTRIPMAP_API_KEY=your-opentripmap-key
```

## Getting Started

1. Install dependencies using your preferred package manager:

```bash
# Using pnpm (recommended)
pnpm install

# Using npm
npm install

# Using yarn
yarn install

# Using bun
bun install
```

> Note: Installing dependencies also installs the agent's Python deps via `install:agent`.

2. Configure Gemini:

Create `agent/.env` with:

```bash
GOOGLE_API_KEY=your-google-api-key-here
# or GEMINI_API_KEY=your-google-api-key-here

# Optional model override
# GEMINI_MODEL=gemini-2.5-flash
# or use MODEL_NAME to override generically
# MODEL_NAME=gemini-2.5-flash
```

This starter is configured to use Gemini only, initialized eagerly at startup to avoid blocking calls during async runs.

3. Start the development server:

```bash
# Using pnpm
pnpm dev

# Using npm
npm run dev

# Using yarn
yarn dev

# Using bun
bun run dev
```

This starts both UI and agent concurrently.

## Available Scripts

The following scripts can also be run using your preferred package manager:

- `dev` - Starts both UI and agent servers in development mode
- `dev:debug` - Starts development servers with debug logging enabled
- `dev:ui` - Starts only the Next.js UI server
- `dev:agent` - Starts only the LangGraph agent server
- `build` - Builds the Next.js application for production
- `start` - Starts the production server
- `lint` - Runs ESLint for code linting
- `install:agent` - Installs Python dependencies for the agent

Example using pnpm:

```bash
pnpm dev         # run everything
pnpm dev:ui      # UI only (http://localhost:3000)
pnpm dev:agent   # Agent only (http://localhost:8123 or configured)
pnpm build && pnpm start
```

## CopilotKit & LangGraph

This app uses:

- CopilotKit React UI: the `CopilotSidebar` and actions (`useCopilotAction`) in `src/app/page.tsx` to send/receive structured updates.
- CopilotKit Core: the `useCoAgent` state shares the document content with the agent.
- LangGraph (Python): orchestrates the agent workflow in `agent/agent.py` with a tool-enabled chat node.
- Tools: custom tools like `create_itinerary_template`, `add_planning_section`, etc., returning fenced JSON blocks (`json itinerary / `json checklist) for rich rendering in the UI.

The main UI component is in `src/app/page.tsx`. You can:

- Modify the theme colors and styling
- Add new frontend actions
- Customize the CopilotKit sidebar appearance

The agent lives in `agent/agent.py`. It binds Gemini and tools, builds a graph with `StateGraph`, and instructs the LLM to call tools that emit JSON fences for front-end rendering.

## 📚 Documentation

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/) - Learn more about LangGraph and its features
- [CopilotKit Documentation](https://docs.copilotkit.ai) - Explore CopilotKit's capabilities
- [Next.js Documentation](https://nextjs.org/docs) - Learn about Next.js features and API

## Troubleshooting

### Common env issues

- 401 on sign-in: verify `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`.
- Agent errors: verify `GOOGLE_API_KEY`/`GEMINI_API_KEY` and that the agent server is running.
- No rich rendering: ensure the agent outputs fenced JSON blocks and the UI uses `components={MarkdownComponents}` in the markdown renderer.

## Contributing

Feel free to submit issues and enhancement requests! This starter is designed to be easily extensible.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Troubleshooting

### Agent Connection Issues

If you see "I'm having trouble connecting to my tools", make sure:

1. The LangGraph agent is running on port 8000
2. Your Google Gemini API key is set correctly
3. Both servers started successfully

### Python Dependencies

If you encounter Python import errors:

```bash
npm install:agent
```
