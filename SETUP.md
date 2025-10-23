# Frizzle Setup Guide 🌟

Welcome to Frizzle - your collaborative AI-powered planning companion! Follow these steps to get your app running.

## 🚀 Quick Setup

### 1. Install Dependencies

```bash
pnpm install
# or npm install / yarn install
```

### 2. Environment Variables

Create a `.env.local` file in the root directory with these variables:

```bash
# Database (MongoDB)
# Example for MongoDB Atlas; replace <user>, <pass>, <cluster>, <db>
DATABASE_URL="mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>?retryWrites=true&w=majority"

# NextAuth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here-make-it-long-and-random"

# Google OAuth (you'll provide these)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Google Gemini API (for the AI agent)
GOOGLE_API_KEY="your-google-api-key-here"
GEMINI_MODEL="gemini-2.5-flash"
```

### 3. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set application type to "Web application"
6. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
7. Copy the Client ID and Client Secret to your `.env.local`

### 4. Database Setup (MongoDB)

```bash
# Initialize the database schema
pnpm db:push

# Optional: Open Prisma Studio to view your data
pnpm db:studio
```

### 5. Start the Application

```bash
pnpm dev
```

This will start:

- 🌐 Next.js frontend on `http://localhost:3000`
- 🤖 LangGraph agent on `http://localhost:8123`

## 🎯 How It Works

### Core Features

- **Solo Planning**: Work alone on your travel plans, research, or brainstorming
- **Group Collaboration**: Create groups with 6-character codes, invite friends
- **Real-time AI**: Chat with Gemini to iteratively build your markdown documents
- **Ready System**: Group consensus mechanism - when everyone clicks "Ready", the document is archived
- **Document Export**: Download your final plans as markdown files

### User Flow

1. **Sign in** with Google account
2. **Create a group** or **join existing** with a group code
3. **Chat with AI** to build your document collaboratively
4. **Mark ready** when satisfied with the plan
5. **Download** the final document when everyone is ready

### Collaboration Features

- Real-time document updates (planned with WebSockets)
- Member status indicators (ready/not ready)
- Group code sharing
- Automatic archiving when consensus reached

## 🔧 Development Commands

```bash
# Development
pnpm dev              # Start both UI and agent
pnpm dev:ui          # Start only Next.js frontend
pnpm dev:agent       # Start only LangGraph agent

# Database
pnpm db:push         # Push schema changes to database
# pnpm db:migrate    # Not supported with MongoDB
pnpm db:studio       # Open Prisma Studio

# Build & Deploy
pnpm build           # Build for production
pnpm start           # Start production server
```

## 📂 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/           # NextAuth.js routes
│   │   ├── groups/         # Group management APIs
│   │   └── copilotkit/     # CopilotKit integration
│   ├── auth/signin/        # Custom sign-in page
│   └── page.tsx           # Main planning interface
├── components/
│   └── providers/         # React context providers
├── lib/
│   ├── auth.ts           # NextAuth configuration
│   └── prisma.ts         # Database client
└── prisma/
    └── schema.prisma     # Database schema

agent/
├── agent.py              # LangGraph agent (Gemini-powered)
├── requirements.txt      # Python dependencies
└── .env                 # Agent environment variables
```

## 🎨 Customization

### Styling

- Uses Tailwind CSS for styling
- Responsive design for mobile/desktop
- Easily customizable color schemes

### AI Behavior

- Modify `agent/agent.py` to change AI personality or capabilities
- Add new tools and actions for specialized planning
- Customize system prompts for different use cases

## 🚨 Troubleshooting

### Common Issues

**"Unauthorized" errors**

- Check your Google OAuth credentials
- Ensure redirect URIs are correct
- Verify NEXTAUTH_SECRET is set

**Database errors (MongoDB)**

- Ensure your MongoDB cluster IP allowlist includes your IP (Atlas)
- Verify `DATABASE_URL` uses the correct db name and credentials
- MongoDB does not support Prisma migrations; always use `pnpm db:push`

**Agent connection issues**

- Verify GOOGLE_API_KEY is valid
- Check agent is running on port 8123
- Look for blocking errors in agent logs

### Development Tips

- Use `pnpm db:studio` to inspect database
- Check browser dev tools for API errors
- Monitor agent logs for AI-related issues

## 🌟 Next Steps

Your Frizzle app is now ready! Here's what you can do:

1. **Test the flow**: Create a group, invite a friend, plan something together
2. **Customize the AI**: Modify prompts in `agent/agent.py` for your use case
3. **Add features**: Extend with new CopilotKit actions or database models
4. **Deploy**: Use Vercel for frontend, Railway/Render for agent

Happy planning! 🎉
