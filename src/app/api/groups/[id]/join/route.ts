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
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Group code is required" }, { status: 400 });
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Find the group by code
    const group = await prisma.group.findUnique({
      where: { code: id.toUpperCase() },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              }
            }
          }
        }
      }
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    if (group.isArchived) {
      return NextResponse.json({ error: "This group is archived and cannot be joined" }, { status: 400 });
    }

    // Check if user is already a member
    const existingMember = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: group.id,
          userId: user.id
        }
      }
    });

    if (existingMember) {
      return NextResponse.json({ error: "You are already a member of this group" }, { status: 400 });
    }

    // Add the user as a member
    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: user.id,
      }
    });

    // Fetch the updated group with all members
    const updatedGroup = await prisma.group.findUnique({
      where: { id: group.id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              }
            }
          }
        }
      }
    });

    try {
      // @ts-ignore
      const io = (global as any).io;
      io?.to(group.id).emit('group:update', { groupId: group.id });
    } catch {}

    return NextResponse.json(updatedGroup);
  } catch (error) {
    console.error("Error joining group:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}



