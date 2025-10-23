import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ content: group.content });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { content } = await request.json();
    if (typeof content !== "string") {
      return NextResponse.json({ error: "Invalid content" }, { status: 400 });
    }

    const group = await prisma.group.update({
      where: { id },
      data: { content },
      select: { id: true }
    });

    try {
      // @ts-ignore
      const io = (global as any).io;
      io?.to(group.id).emit('group:content', { groupId: group.id });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating content:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


