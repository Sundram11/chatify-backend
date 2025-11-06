import cookie from "cookie";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ChatEventEnum } from "../../constants.js";

/**
 * Keep a map of connected users → Set of socket IDs
 * This allows proper cleanup and prevents duplicate joins
 */
const connectedUsers = new Map(); // userId → Set<socket.id>

/**
 * 🟢 Clean up user sockets when they reconnect or disconnect
 */
const cleanupUserSockets = (userId, socketId = null) => {
  const sockets = connectedUsers.get(userId);
  if (!sockets) return;

  if (socketId) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      connectedUsers.delete(userId);
    } else {
      connectedUsers.set(userId, sockets);
    }
  } else {
    connectedUsers.delete(userId);
  }
};

/**
 * 🟩 Handle JOIN_CHAT_EVENT — safely join a room
 */
const mountJoinChatEvent = (socket, io) => {
  socket.on(ChatEventEnum.JOIN_CHAT_EVENT, async (chatId) => {
    if (!chatId) return;

    // Prevent duplicate joins (Socket.IO auto-ignores, but for clarity)
    if (socket.rooms.has(chatId)) {
      console.log(`⚪ ${socket.user.fullName} already in chat → ${chatId}`);
      return;
    }

    socket.join(chatId);
    console.log(`👥 ${socket.user.fullName} joined chat → ${chatId}`);
  });
};

/**
 * 🟥 Handle LEAVE_CHAT_EVENT
 */
const mountLeaveChatEvent = (socket, io) => {
  socket.on(ChatEventEnum.LEAVE_CHAT_EVENT, (chatId) => {
    if (!chatId) return;
    socket.leave(chatId);
    console.log(`🚪 ${socket.user.fullName} left chat → ${chatId}`);
  });
};

/**
 * 🟦 Initialize Socket.IO
 */
export const initializeSocketIO = (io) => {
  io.on("connection", async (socket) => {
    try {
      // 🟨 Extract token
      const cookies = cookie.parse(socket.handshake.headers?.cookie || "");
      const token = cookies?.accessToken || socket.handshake.auth?.token;
      if (!token) throw new ApiError(401, "Unauthorized handshake");

      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const user = await User.findById(decoded?._id).select(
        "-password -refreshToken"
      );
      if (!user) throw new ApiError(401, "Invalid user");

      socket.user = user;
      const userId = user._id.toString();

      // 🧹 Clean up any old sockets for the same user (optional per session)
      if (!connectedUsers.has(userId)) {
        connectedUsers.set(userId, new Set());
      }

      const userSockets = connectedUsers.get(userId);
      userSockets.add(socket.id);

      socket.join(userId); // personal room for direct emits
      console.log(`🟢 ${user.fullName} connected (${userSockets.size} sockets)`);

      // 🧠 Attach event handlers
      mountJoinChatEvent(socket, io);
      mountLeaveChatEvent(socket, io);

      // 🧹 Handle disconnect cleanly
      socket.on("disconnect", () => {
        cleanupUserSockets(userId, socket.id);
        console.log(
          `🔴 ${socket.user.fullName} disconnected (${connectedUsers.get(userId)?.size || 0} sockets left)`
        );
      });
    } catch (err) {
      console.error("❌ Socket connection error:", err.message);
      socket.emit(ChatEventEnum.SOCKET_ERROR_EVENT, err.message);
      socket.disconnect(true);
    }
  });
};

/**
 * 🟧 Emit event to room safely
 */
export const emitSocketEvent = (req, roomId, event, payload) => {
  const io = req.app.get("io");
  if (!io) {
    console.error("❌ Socket.io not initialized");
    return;
  }
  io.to(roomId).emit(event, payload);
};
