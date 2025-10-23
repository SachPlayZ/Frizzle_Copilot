"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCoAgent, useCopilotAction } from "@copilotkit/react-core";
import { CopilotKitCSSProperties, CopilotSidebar } from "@copilotkit/react-ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { io as clientIo, Socket } from "socket.io-client";
import {
  Users,
  Plus,
  Download,
  Share2,
  CheckCircle,
  Circle,
  LogOut,
  Copy,
  Archive,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarSeparator,
  SidebarInset,
  SidebarTrigger,
  SidebarRail,
  useSidebar,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

// Simple chat input component
function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend(text);
        setText("");
      }}
      className="border-t p-2 flex items-center space-x-2"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a message..."
        className="flex-1 border rounded px-2 py-1 text-sm bg-white text-gray-900 placeholder-gray-400"
      />
      <button
        type="submit"
        className="px-3 py-1 bg-blue-600 text-white text-sm rounded"
      >
        Send
      </button>
    </form>
  );
}

// Types
type AgentState = {
  content: string;
  groupId?: string;
};

type Group = {
  id: string;
  code: string;
  name: string;
  content: string;
  members: GroupMember[];
  isArchived: boolean;
};

type GroupMember = {
  id: string;
  user: {
    name: string;
    email: string;
    image: string;
    id?: string;
  };
  isReady: boolean;
};

// JSON-tagged Checklist types and renderer
type ChecklistItem = { label: string; checked?: boolean };
type ChecklistSection = { title: string; items: ChecklistItem[] };
type ChecklistData = {
  type: "checklist";
  version?: number;
  title: string;
  destination?: string;
  context?: string;
  sections: ChecklistSection[];
};

function ChecklistView({ data }: { data: ChecklistData }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="font-semibold text-gray-900">{data.title}</div>
        {data.destination ? (
          <div className="text-xs text-gray-500">{data.destination}</div>
        ) : null}
      </div>
      <div className="p-4 space-y-4">
        {data.sections?.map((section, idx) => (
          <div key={`${section.title}-${idx}`}>
            <div className="text-sm font-medium text-gray-800">
              {section.title}
            </div>
            <ul className="mt-2 space-y-1">
              {section.items?.map((item, i) => (
                <li
                  key={`${item.label}-${i}`}
                  className="flex items-start gap-2"
                >
                  <input
                    type="checkbox"
                    checked={!!item.checked}
                    readOnly
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// Itinerary types and renderer
type Money = { estimate: number; currency: string };
type ItineraryPart = {
  timeOfDay: string;
  activity: {
    name: string;
    description: string;
    category: string;
    location?: string;
  };
  cost?: Money;
};
type ItineraryDay = { day: number; parts: ItineraryPart[]; notes?: string[] };
type ItineraryData = {
  type: "itinerary";
  version?: number;
  destination: string;
  durationDays: number;
  travelStyle: string;
  currency: { code: string; symbol?: string };
  days: ItineraryDay[];
  summary?: { estimatedTotalCost?: Money; breakdown?: Record<string, Money> };
  checklist?: ChecklistData;
};

function MoneyText({ value }: { value?: Money }) {
  if (!value) return null;
  const symbol =
    value.currency === "EUR"
      ? "€"
      : value.currency === "JPY"
      ? "¥"
      : value.currency === "IDR"
      ? "Rp"
      : "$";
  return (
    <span>
      {symbol}
      {value.estimate}
    </span>
  );
}

function ItineraryView({ data }: { data: ItineraryData }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="text-xl font-semibold text-gray-900">
          {data.destination} Itinerary ({data.durationDays} Days)
        </div>
        <div className="text-sm text-gray-500">Style: {data.travelStyle}</div>
      </div>
      {data.summary?.estimatedTotalCost && (
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2 text-sm text-gray-800">
          <span className="font-medium">Estimated Total:</span>
          <MoneyText value={data.summary.estimatedTotalCost} />
        </div>
      )}
      <div className="p-4 space-y-6">
        {data.days.map((d) => (
          <div key={d.day} className="rounded-md border border-gray-200">
            <div className="px-4 py-2 border-b bg-gray-50 text-sm font-medium text-gray-800">
              Day {d.day}
            </div>
            <div className="p-4 space-y-3">
              {d.parts.map((p, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="w-24 shrink-0 text-xs font-medium text-gray-600 mt-1">
                    {p.timeOfDay}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">
                        {p.activity.name}
                      </div>
                      <div className="text-sm text-gray-700">
                        <MoneyText value={p.cost} />
                      </div>
                    </div>
                    <div className="text-sm text-gray-700">
                      {p.activity.description}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {p.activity.category}
                      {p.activity.location ? ` • ${p.activity.location}` : ""}
                    </div>
                  </div>
                </div>
              ))}
              {d.notes && d.notes.length > 0 && (
                <ul className="mt-2 list-disc pl-6 text-sm text-gray-700">
                  {d.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {data.checklist && (
          <div>
            <div className="text-lg font-semibold text-gray-900 mb-2">
              Checklist
            </div>
            <ChecklistView data={data.checklist} />
          </div>
        )}
      </div>
    </div>
  );
}

const MarkdownComponents = {
  code({ inline, className, children, ...props }: any) {
    const isBlock = !inline;
    const lang = (className || "").replace("language-", "");
    const raw = String(children || "").trim();
    if (
      isBlock &&
      (lang === "json" || (className || "").includes("language-json"))
    ) {
      try {
        const data = JSON.parse(raw);
        if (data && data.type === "checklist" && Array.isArray(data.sections)) {
          return <ChecklistView data={data as ChecklistData} />;
        }
        if (data && data.type === "itinerary" && Array.isArray(data.days)) {
          return <ItineraryView data={data as ItineraryData} />;
        }
      } catch {}
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export default function TravelPlannerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [messages, setMessages] = useState<
    Array<{
      id: string;
      userId: string;
      content: string;
      createdAt: string;
      user?: {
        id: string;
        name?: string | null;
        email?: string | null;
        image?: string | null;
      };
    }>
  >([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/auth/signin");
    }
  }, [session, status, router]);

  // Restore selected group on refresh
  useEffect(() => {
    if (status !== "authenticated") return;
    if (currentGroup) return;
    try {
      const savedId =
        typeof window !== "undefined"
          ? localStorage.getItem("currentGroupId")
          : null;
      if (!savedId) return;
      (async () => {
        const res = await fetch(`/api/groups/${savedId}`);
        if (res.ok) {
          const group = await res.json();
          setCurrentGroup(group);
        } else {
          localStorage.removeItem("currentGroupId");
        }
      })();
    } catch {}
  }, [status]);

  // Persist selected group id
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (currentGroup?.id) {
        localStorage.setItem("currentGroupId", currentGroup.id);
      } else {
        localStorage.removeItem("currentGroupId");
      }
    } catch {}
  }, [currentGroup?.id]);

  // Shared state with the agent
  const { state, setState } = useCoAgent<AgentState>({
    name: "sample_agent",
    initialState: {
      content: "",
      groupId: currentGroup?.id,
    },
  });

  // Sync agent state with current group and load initial content on group change
  useEffect(() => {
    if (!currentGroup?.id) return;
    // Ensure the agent state knows the active group
    setState({ content: state.content, groupId: currentGroup.id });
    // Load the group's current content into the shared state
    (async () => {
      try {
        const res = await fetch(`/api/groups/${currentGroup.id}/content`);
        if (res.ok) {
          const data = await res.json();
          setState({
            content: (data?.content as string) || "",
            groupId: currentGroup.id,
          });
        }
      } catch {}
    })();
  }, [currentGroup?.id]);

  // Frontend action for updating document content
  useCopilotAction({
    name: "updateDocument",
    parameters: [
      {
        name: "content",
        description: "The updated markdown content for the document",
        required: true,
      },
    ],
    handler: ({ content }) => {
      const nextContent = content ?? "";
      setState({
        ...state,
        content: nextContent,
      });
      saveContentDebounced(nextContent);
    },
  });

  // Frontend action for creating sections
  useCopilotAction({
    name: "addSection",
    parameters: [
      {
        name: "title",
        description: "The title of the new section",
        required: true,
      },
      {
        name: "content",
        description: "The content for the new section",
        required: true,
      },
    ],
    handler: ({ title, content }) => {
      const newContent = state.content + `\n\n## ${title}\n\n${content}`;
      setState({
        ...state,
        content: newContent,
      });
      saveContentDebounced(newContent);
    },
  });

  // Debounced save
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const saveContentDebounced = (content: string) => {
    if (!currentGroup) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/groups/${currentGroup.id}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    }, 400);
  };

  // Socket.IO client
  const socket = useRef<Socket | null>(null);
  useEffect(() => {
    // initialize socket server route
    fetch("/api/socket");
    const s = clientIo({ path: "/api/socket_io" });
    socket.current = s;
    return () => {
      s.disconnect();
    };
  }, []);

  // Join room when group changes
  useEffect(() => {
    if (socket.current && currentGroup?.id) {
      socket.current.emit("join", currentGroup.id);
    }
  }, [currentGroup?.id]);

  // Listen for updates
  useEffect(() => {
    const s = socket.current;
    if (!s || !currentGroup?.id) return;
    const refetchGroup = async () => {
      const res = await fetch(`/api/groups/${currentGroup.id}`);
      if (res.ok) setCurrentGroup(await res.json());
    };
    const refetchContent = async () => {
      const res = await fetch(`/api/groups/${currentGroup.id}/content`);
      if (res.ok) {
        const data = await res.json();
        setState({ ...state, content: data.content });
      }
    };
    s.on("group:update", refetchGroup);
    s.on("group:content", refetchContent);
    s.on("chat:message", (msg: any) => {
      if (msg?.groupId === currentGroup.id) {
        setMessages((prev) => [...prev, msg]);
      }
    });
    return () => {
      s.off("group:update", refetchGroup);
      s.off("group:content", refetchContent);
      s.off("chat:message");
    };
  }, [currentGroup?.id, state]);

  // Fetch initial chat messages when group changes
  useEffect(() => {
    (async () => {
      if (!currentGroup?.id) return;
      try {
        const res = await fetch(`/api/groups/${currentGroup.id}/chat`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data?.messages ?? []);
        }
      } catch {}
    })();
  }, [currentGroup?.id]);

  const sendMessage = async (text: string) => {
    if (!currentGroup?.id) return;
    const content = text.trim();
    if (!content) return;
    try {
      await fetch(`/api/groups/${currentGroup.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch {}
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!session) {
    return null; // Will redirect
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;

    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: groupName }),
      });

      if (response.ok) {
        const group = await response.json();
        setCurrentGroup(group);
        setShowGroupModal(false);
        setGroupName("");
      }
    } catch (error) {
      console.error("Error creating group:", error);
    }
  };

  const handleJoinGroup = async () => {
    if (!joinCode.trim()) return;

    try {
      const response = await fetch(`/api/groups/${joinCode}/join`, {
        method: "POST",
      });

      if (response.ok) {
        const group = await response.json();
        setCurrentGroup(group);
        setShowJoinModal(false);
        setJoinCode("");
      }
    } catch (error) {
      console.error("Error joining group:", error);
    }
  };

  const handleToggleReady = async () => {
    if (!currentGroup) return;

    const newReadyState = !isReady;
    setIsReady(newReadyState);

    try {
      await fetch(`/api/groups/${currentGroup.id}/ready`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isReady: newReadyState }),
      });
    } catch (error) {
      console.error("Error updating ready state:", error);
    }
  };

  const handleDownloadDocument = async () => {
    try {
      // Try client-side PDF export of the rendered itinerary/content
      const html2canvasMod: any = await (Function(
        "return import('https://cdn.skypack.dev/html2canvas')"
      )() as Promise<any>);
      const jspdfMod: any = await (Function(
        "return import('https://cdn.skypack.dev/jspdf')"
      )() as Promise<any>);

      const el = document.getElementById("itinerary-render") || document.body;

      // Temporarily expand preview to full content height to capture everything
      const prevStyle = {
        height: (el as HTMLElement).style.height,
        maxHeight: (el as HTMLElement).style.maxHeight,
        overflow: (el as HTMLElement).style.overflow,
      } as const;
      (el as HTMLElement).style.height = "auto";
      (el as HTMLElement).style.maxHeight = "none";
      (el as HTMLElement).style.overflow = "visible";

      const canvas = await html2canvasMod.default(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      // Restore preview styles
      (el as HTMLElement).style.height = prevStyle.height;
      (el as HTMLElement).style.maxHeight = prevStyle.maxHeight;
      (el as HTMLElement).style.overflow = prevStyle.overflow;
      const imgData = canvas.toDataURL("image/png");
      const JsPdfCtor = jspdfMod.jsPDF || jspdfMod.default;
      const pdf = new JsPdfCtor("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgProps = pdf.getImageProperties(imgData);
      const imgWidth = pdfWidth;
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
      pdf.save(`${currentGroup?.name || "itinerary"}.pdf`);
    } catch (e) {
      // Fallback: open print dialog for user to save as PDF
      try {
        window.print();
      } catch {
        // Last resort: download markdown
        const blob = new Blob([state.content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${currentGroup?.name || "document"}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }
  };

  const copyGroupCode = () => {
    if (currentGroup?.code) {
      navigator.clipboard.writeText(currentGroup.code);
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <Sidebar
        side="left"
        collapsible="icon"
        className="transition-all duration-200 ease-linear"
      >
        <SidebarContent>
          <SidebarHeader>
            <div className="text-sm font-medium text-gray-900">Group</div>
          </SidebarHeader>
          <SidebarSeparator />
          {/* Collapsed rail avatars */}
          <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center gap-3 p-3">
            {currentGroup ? (
              <>
                {currentGroup.members.slice(0, 5).map((m) => (
                  <img
                    key={m.id}
                    src={m.user.image || "/default-avatar.png"}
                    alt={m.user.name || "User"}
                    className="h-10 w-10 rounded-full"
                    title={m.user.name || m.user.email}
                  />
                ))}
              </>
            ) : (
              <>
                <img
                  src={session.user?.image || "/default-avatar.png"}
                  alt={session.user?.name || "User"}
                  className="h-10 w-10 rounded-full"
                />
                <button
                  onClick={() => setShowGroupModal(true)}
                  className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center"
                  title="Create Group"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="p-2 space-y-4 group-data-[collapsible=icon]:hidden">
                {currentGroup ? (
                  <>
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-gray-900">
                        {currentGroup.name}
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="px-2 py-0.5 rounded text-xs font-mono bg-blue-50 text-blue-800 border border-blue-200">
                          {currentGroup.code}
                        </code>
                        <button
                          onClick={copyGroupCode}
                          className="text-blue-600 hover:text-blue-800 text-xs"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={handleToggleReady}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          isReady
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {isReady ? "Ready ✓" : "Not Ready"}
                      </button>
                      <button
                        onClick={handleDownloadDocument}
                        className="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 text-gray-700 flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" /> PDF
                      </button>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-1">
                        Members
                      </div>
                      <div className="space-y-3">
                        {currentGroup.members.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between"
                            title={member.user.name || member.user.email}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={member.user.image || "/default-avatar.png"}
                                alt={member.user.name || "User"}
                                className="h-8 w-8 rounded-full"
                              />
                              <span className="text-sm text-gray-900 truncate">
                                {member.user.name || member.user.email}
                              </span>
                            </div>
                            {member.isReady ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <Circle className="h-4 w-4 text-gray-400" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-600">
                    No group selected.
                  </div>
                )}
                <div className="border-t pt-4 group-data-[collapsible=icon]:hidden">
                  <div className="text-xs font-medium text-gray-700 mb-2">
                    Actions
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setShowGroupModal(true)}
                      className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    >
                      <Plus className="h-4 w-4 inline-block mr-1" /> Create
                    </button>
                    <button
                      onClick={() => setShowJoinModal(true)}
                      className="px-3 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-sm"
                    >
                      <Share2 className="h-4 w-4 inline-block mr-1" /> Join
                    </button>
                  </div>
                </div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarFooter className="group-data-[collapsible=icon]:hidden mt-auto">
            {currentGroup && (
              <div className="p-2 border-t flex flex-col h-64 gap-2">
                <div className="text-lg font-medium text-gray-700">
                  Group Chat
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                  {messages
                    .filter(
                      (m) => !selectedMemberId || m.userId === selectedMemberId
                    )
                    .map((m) => (
                      <div key={m.id} className="text-xs text-gray-900">
                        <span className="font-medium mr-1">
                          {m.user?.name || m.user?.email || "User"}:
                        </span>
                        <span>{m.content}</span>
                      </div>
                    ))}
                </div>
                <div className="mt-1">
                  <ChatInput onSend={sendMessage} />
                </div>
              </div>
            )}
          </SidebarFooter>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset
        style={
          {
            "--copilot-kit-primary-color": "#6366f1",
          } as CopilotKitCSSProperties
        }
        className="min-h-screen bg-gray-50"
      >
        {/* Header */}
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-bold text-gray-900">Frizzle</h1>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <img
                    src={session.user?.image || "/default-avatar.png"}
                    alt={session.user?.name || "User"}
                    className="h-8 w-8 rounded-full"
                  />
                  <button
                    onClick={() => signOut()}
                    className="p-2 text-gray-600 hover:text-gray-900"
                    title="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="w-9/10 mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Removed duplicate inline group card; using shadcn sidebar instead */}

            {/* Markdown Editor/Preview */}
            <div className="lg:col-span-12 bg-white rounded-lg shadow-sm border">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900">Document</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const filename = `${currentGroup?.name || "document"}.md`;
                      const blob = new Blob([state.content || ""], {
                        type: "text/markdown",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = filename;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    className="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 text-gray-700"
                  >
                    Download .md
                  </button>
                  <button
                    onClick={handleDownloadDocument}
                    className="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 text-gray-700 flex items-center gap-1"
                  >
                    <Download className="h-4 w-4" /> PDF
                  </button>
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5">
                  <textarea
                    value={state.content}
                    onChange={(e) => {
                      setState({ ...state, content: e.target.value });
                      saveContentDebounced(e.target.value);
                    }}
                    placeholder="Welcome to Frizzle"
                    className="w-full h-72 md:h-96 border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400 transition-colors"
                  />
                </div>
                <div className="lg:col-span-7">
                  <div
                    id="itinerary-render"
                    className="prose prose-headings:text-gray-900 prose-p:text-gray-900 prose-strong:text-gray-900 prose-code:text-gray-900 max-w-none animate-[fadein_0.2s_ease-in] h-72 md:h-96 overflow-auto"
                  >
                    {state.content ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={MarkdownComponents as any}
                      >
                        {state.content}
                      </ReactMarkdown>
                    ) : (
                      <div className="space-y-3">
                        <Skeleton className="h-6 w-2/3" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* No right panel; more space for the document */}
          </div>
        </div>

        {/* Copilot Sidebar */}
        <CopilotSidebar
          clickOutsideToClose={false}
          defaultOpen={true}
          labels={{
            title: "Planning Assistant",
            initial: `👋 Hey ${
              session.user?.name?.split(" ")[0] || "there"
            }! I'm your AI planning assistant. I can help you:\n\n📝 **Create & Edit Documents**\n- Travel itineraries\n- Research plans  \n- Meeting agendas\n- Startup ideas\n\n🤝 **Collaborate in Real-time**\n- Work with your group members\n- Keep everyone on the same page\n\n✨ **Smart Suggestions**\n- Add relevant sections\n- Improve existing content\n- Research destinations & ideas\n\nJust tell me what you'd like to plan and I'll help you build an amazing document together!`,
          }}
        />

        {/* Chat Panel moved into sidebar footer */}

        {/* Create Group Modal */}
        {showGroupModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Create New Group
              </h3>
              <input
                type="text"
                placeholder="Group name (e.g., 'Tokyo Trip 2024')"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 bg-white text-gray-900 placeholder-gray-400"
              />
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowGroupModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGroup}
                  disabled={!groupName.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Join Group Modal */}
        {showJoinModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Join Group
              </h3>
              <input
                type="text"
                placeholder="Enter 6-character group code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 bg-white text-gray-900 placeholder-gray-400"
                maxLength={6}
              />
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleJoinGroup}
                  disabled={joinCode.length !== 6}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
