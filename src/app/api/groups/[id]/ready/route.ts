import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: {
    id: string;
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await params;
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { isReady } = await request.json();
    
    if (!groupId || typeof groupId !== "string") {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    if (typeof isReady !== "boolean") {
      return NextResponse.json({ error: "isReady must be a boolean" }, { status: 400 });
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if the group exists and user is a member
    const groupMember = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: user.id
        }
      }
    });

    if (!groupMember) {
      return NextResponse.json({ error: "You are not a member of this group" }, { status: 403 });
    }

    // Update the ready status
    await prisma.groupMember.update({
      where: {
        id: groupMember.id
      },
      data: {
        isReady
      }
    });

    // Check if all members are ready
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: true
      }
    });

    if (group) {
      const allReady = group.members.every((member: { isReady: boolean }) => member.isReady);
      
      if (allReady && group.members.length > 0) {
        // Create archive if all members are ready
        const existingArchive = await prisma.archive.findUnique({
          where: { groupId }
        });

        if (!existingArchive) {
          await prisma.archive.create({
            data: {
              groupId,
              content: group.content,
              name: `${group.name} - Final`,
              createdById: user.id,
            }
          });

          // Mark group as archived
          await prisma.group.update({
            where: { id: groupId },
            data: { isArchived: true }
          });

          try {
            // @ts-ignore
            const io = (global as any).io;
            io?.to(groupId).emit('group:update', { groupId });
          } catch {}
        }
      }
    }

    return NextResponse.json({ success: true, isReady });
  } catch (error) {
    console.error("Error updating ready status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
