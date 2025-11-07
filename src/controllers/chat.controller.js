import { Chat } from "../models/Chat.model.js";
import { ApiError } from "../utils/ApiError.js";
import mongoose from "mongoose";

export const findOneToOneChatId = async (userId, friendId) => {
  if (!userId || !friendId) {
    throw new ApiError(400, "Both userId and friendId are required");
  }

  const chat = await Chat.findOne({
    isGroup: false,
    participants: { $all: [userId, friendId] },
  });

  if (!chat) throw new ApiError(404, "1-to-1 chat not found");

  return chat; // ✅ return full chat object
};

export const createOneToOneChatId = async (user1Id, user2Id) => {
  const u1 = new mongoose.Types.ObjectId(user1Id);
  const u2 = new mongoose.Types.ObjectId(user2Id);

  // ✅ check existing
  let existingChat = await Chat.findOne({
    isGroup: false,
    participants: { $all: [u1, u2] },
  });

  if (existingChat) return existingChat; // ✅ return whole chat

  // ✅ create new
  const newChat = await Chat.create({
    isGroup: false,
    participants: [u1, u2],
  });

  return newChat;
};

export const findGroupChatId = async (groupId) => {
  if (!groupId) throw new ApiError(400, "groupId is required");

  const chat = await Chat.findOne({ _id: groupId, isGroup: true });

  if (!chat) throw new ApiError(404, "Group chat not found");

  return chat._id;
};

export const createGroupChatId = async ({ name, participantIds, adminId }) => {
  if (!name || !participantIds?.length || !adminId) {
    throw new ApiError(400, "Group name, participants, and admin are required");
  }

  const chat = await Chat.create({
    isGroup: true,
    name,
    participants: participantIds,
    admin: adminId,
  });

  return chat._id;
};
