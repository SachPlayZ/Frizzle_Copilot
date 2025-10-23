import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: { id: string };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
      owner: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(group);
}

// POST a chat message to the group
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const content = (body?.content ?? "").toString().trim();
    if (!content) {
      return NextResponse.json({ error: "Empty content" }, { status: 400 });
    }
    // Ensure user is member of group
    const membership = await prisma.groupMember.findFirst({
      where: { groupId: id, userId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const message = await (prisma as any).chatMessage.create({
      data: {
        groupId: id,
        userId,
        content,
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    try {
      // @ts-ignore
      const io = (global as any).io;
      io?.to(id).emit("chat:message", message);
    } catch {}

    return NextResponse.json(message);
  } catch (error) {
    console.error("Error posting chat message:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


