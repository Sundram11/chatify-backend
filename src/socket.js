// backend/socket.js
import { Server } from "socket.io";
import http from "http";
import { ApiError } from "./utils/ApiError.js";
import { initializeSocketIO } from "./controllers/socket.controller.js";

let io;

export const initSocket = (app) => {
  const server = http.createServer(app);

  io = new Server(server, {
    pingTimeout: 60000,
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:5173",
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  app.set("io", io);

  // Initialize all socket event handlers
  initializeSocketIO(io);

  console.log("✅ Socket.io initialized successfully.");

  return { io, server };
};

export const getIO = () => {
  if (!io) throw new ApiError(500, "Socket.io not initialized yet!");
  return io;
};
