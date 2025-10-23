import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const messages = await prisma.chatMessage.findMany({
    where: { groupId: id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    take: 200,
  });
  return NextResponse.json({ messages });
}


