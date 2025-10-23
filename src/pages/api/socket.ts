import type { NextApiRequest, NextApiResponse } from 'next';
import { Server as IOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';

type NextApiResponseWithSocket = NextApiResponse & {
  socket: any & {
    server: HTTPServer & {
      io?: IOServer;
    };
  };
};

export default function handler(_req: NextApiRequest, res: NextApiResponseWithSocket) {
  if (!res.socket.server.io) {
    const io = new IOServer(res.socket.server, {
      path: '/api/socket_io',
    });
    res.socket.server.io = io;
    (global as any).io = io;

    io.on('connection', (socket) => {
      socket.on('join', (room: string) => {
        if (typeof room === 'string') socket.join(room);
      });
    });
  }

  res.end();
}


