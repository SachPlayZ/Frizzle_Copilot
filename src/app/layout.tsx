import type { Metadata } from "next";

import { CopilotKit } from "@copilotkit/react-core";
import SessionProvider from "@/components/providers/SessionProvider";
import "./globals.css";
import "@copilotkit/react-ui/styles.css";

export const metadata: Metadata = {
  title: "Frizzle - Realtime Travel Planner",
  description:
    "Collaborative AI-powered travel planning and brainstorming tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={"antialiased"}>
        <SessionProvider>
          <CopilotKit
            publicLicenseKey="ck_pub_de89f807dd75cfde77a283c8f9ddede1"
            runtimeUrl="/api/copilotkit"
            agent="sample_agent"
          >
            {children}
          </CopilotKit>
        </SessionProvider>
      </body>
    </html>
  );
}
