import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name } = await request.json();
    
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Generate a unique 6-character code
    let code: string;
    let codeExists = true;
    
    while (codeExists) {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const existingGroup = await prisma.group.findUnique({
        where: { code }
      });
      codeExists = !!existingGroup;
    }

    // Create the group
    const group = await prisma.group.create({
      data: {
        name,
        code: code!,
        ownerId: user.id,
        content: "",
      },
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
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          }
        }
      }
    });

    // Add the creator as a member
    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: user.id,
      }
    });

  // Emit realtime update
  try {
    // @ts-ignore
    const io = (global as any).io;
    io?.to(group.id).emit('group:update', { groupId: group.id });
  } catch {}

    // Fetch the group again with the member included
    const groupWithMembers = await prisma.group.findUnique({
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

    return NextResponse.json(groupWithMembers);
  } catch (error) {
    console.error("Error creating group:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get all groups where the user is a member
    const groups = await prisma.group.findMany({
      where: {
        members: {
          some: {
            userId: user.id
          }
        }
      },
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
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    return NextResponse.json(groups);
  } catch (error) {
    console.error("Error fetching groups:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
