import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { Chat } from "../models/Chat.model.js";
import { Message } from "../models/message.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { emitSocketEvent } from "./socket.controller.js";
import { ChatEventEnum } from "../../constants.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";

// ✅ Get messages for a chat (one-to-one or group)
const getMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { page = 1, limit = 15 } = req.query; // default: page 1, 20 messages per page

  if (!chatId) throw new ApiError(400, "chatId is required");

  // ✅ Convert to numbers and calculate skip
  const skip = (Number(page) - 1) * Number(limit);

  // ✅ Fetch messages sorted by newest first
  const messages = await Message.find({ chatId })
    .populate("sender", "fullName profilePic")
    .sort({ createdAt: -1 }) // newest first
    .skip(skip)
    .limit(Number(limit));

  // ✅ Reverse before sending (so frontend displays top-to-bottom)
  const orderedMessages = messages.reverse();

  // ✅ Get total messages count for pagination info
  const totalMessages = await Message.countDocuments({ chatId });
  const totalPages = Math.ceil(totalMessages / Number(limit));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        messages: orderedMessages,
        pagination: {
          totalMessages,
          totalPages,
          currentPage: Number(page),
          limit: Number(limit),
          hasMore: Number(page) < totalPages,
        },
      },
      "Messages fetched successfully"
    )
  );
});

// ✅ Send a message
const sendMessage = asyncHandler(async (req, res) => {
  const { text, chatId } = req.body;
  const senderId = req.user?._id;

  if (!text && !req.file)
    throw new ApiError(400, "Message text or file required");
  if (!chatId) throw new ApiError(400, "chatId is required");

  let fileUrl = null;
  let filePublicId = null;
  let messageType = "text";

  // 🟩 1️⃣ Handle file upload (if any)
  if (req.file?.path) {
    const uploaded = await uploadOnCloudinary(req.file.path);
    fileUrl = uploaded?.secure_url || null;
    filePublicId = uploaded?.public_id || null;

    const mime = req.file.mimetype || "";
    if (mime.startsWith("image/")) messageType = "image";
    else if (mime.startsWith("video/")) messageType = "video";
    else if (mime.startsWith("audio/")) messageType = "audio";
    else messageType = "file";
  }

  // 🟦 2️⃣ Create and populate message
  const newMessage = await Message.create({
    sender: senderId,
    chatId,
    text: text?.trim() || "",
    fileUrl,
    filePublicId,
    messageType,
    status: "sent",
  });

  const populatedMessage = await newMessage.populate(
    "sender",
    "fullName profilePic"
  );

  // 🟧 3️⃣ Emit new message to all participants in that chat
  emitSocketEvent(
    req,
    chatId,
    ChatEventEnum.MESSAGE_RECEIVED_EVENT,
    populatedMessage
  );

  // 🟨 4️⃣ Fetch participants for unread updates
  const chat = await Chat.findById(chatId).select("participants");
  if (!chat) throw new ApiError(404, "Chat not found");

  // 🟩 5️⃣ Send UNREAD_COUNT_UPDATE to everyone except sender
  chat.participants.forEach((userId) => {
    if (userId.toString() !== senderId.toString()) {
      emitSocketEvent(
        req,
        userId.toString(),
        ChatEventEnum.UNREAD_COUNT_UPDATE,
        {
          chatId,
          senderId: senderId.toString(),
          message: text?.trim() || "[Media]",
        }
      );
    }
  });

  // 🟦 6️⃣ Respond with created message
  return res
    .status(201)
    .json(new ApiResponse(201, populatedMessage, "Message sent successfully"));
});

// ✅ Edit message
const editMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const { text } = req.body;
  const userId = req.user?._id;
  console.log("edit")

  if (!text || text.trim() === "")
    throw new ApiError(400, "Edited message text cannot be empty");

  const message = await Message.findById(messageId).populate(
    "sender",
    "fullName profilePic"
  ); // ✅ include sender

  if (!message) throw new ApiError(404, "Message not found");
  if (message.sender._id.toString() !== userId.toString())
    throw new ApiError(403, "You can edit only your own messages");

  message.text = text.trim();
  message.isEdited = true;
  await message.save({ validateBeforeSave: false });

  // ✅ Emit the full message with sender populated
  emitSocketEvent(
    req,
    message.chatId,
    ChatEventEnum.MESSAGE_EDIT_EVENT,
    message
  );

  return res
    .status(200)
    .json(new ApiResponse(200, message, "Message edited successfully"));
});

// ✅ Delete message
const deleteMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user?._id;
  console.log("delete");
  // 🟩 1️⃣ Find message
  const message = await Message.findById(messageId);
  if (!message) throw new ApiError(404, "Message not found");

  // 🟥 2️⃣ Only sender can delete
  if (message.sender.toString() !== userId.toString())
    throw new ApiError(403, "You can delete only your own messages");

  // 🟦 3️⃣ Try deleting associated file from Cloudinary
  console.log(message.filePublicId);
  if (message.filePublicId) {
    try {
      await deleteFromCloudinary(message.filePublicId);
      console.log(`✅ File deleted from Cloudinary: ${message.filePublicId}`);
    } catch (err) {
      console.error("⚠️ Failed to delete file from Cloudinary:", err.message);
      // Don’t throw here — still delete message from DB
    }
  }

  // 🟨 4️⃣ Delete message from DB
  await Message.findByIdAndDelete(messageId);

  // 🚀 5️⃣ Emit socket event to notify clients
  emitSocketEvent(req, message.chatId, ChatEventEnum.MESSAGE_DELETE_EVENT, {
    _id: messageId,
    chatId: message.chatId,
  });

  // 🟢 6️⃣ Send response
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Message permanently deleted"));
});

// ✅ Delete a chat and all its messages
const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    // 🟩 1️⃣ Find all messages for this chat
    const messages = await Message.find({ chatId });

    // 🟦 2️⃣ Delete all attached files from Cloudinary
    const filesToDelete = messages
      .filter((msg) => msg.filePublicId) // only messages with uploaded files
      .map((msg) => msg.filePublicId);

    if (filesToDelete.length > 0) {
      for (const publicId of filesToDelete) {
        try {
          await deleteFromCloudinary(publicId);
          console.log(`✅ Deleted from Cloudinary: ${publicId}`);
        } catch (err) {
          console.error(
            `⚠️ Failed to delete file from Cloudinary (${publicId}):`,
            err.message
          );
        }
      }
    }

    // 🟨 3️⃣ Delete all messages from DB
    await Message.deleteMany({ chatId });

    // 🟥 4️⃣ Delete chat itself
    const deletedChat = await Chat.findByIdAndDelete(chatId);
    if (!deletedChat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // 🟢 5️⃣ Respond
    res.json({
      message: "Chat and all related messages & files deleted successfully",
    });
  } catch (error) {
    console.error("❌ deleteChat error:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

// ✅ Get user's friends and groups
const getRecentChats = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, "Unauthorized user");

  // 1️⃣ Find all chats where user is a participant
  const chats = await Chat.find({ participants: userId })
    .populate("participants", "fullName email profilePic")
    .populate("admin", "fullName email profilePic")
    .lean();

  // 2️⃣ Add last message timestamp + inactive info
  const chatsWithTime = await Promise.all(
    chats.map(async (chat) => {
      const lastMsg = await Message.findOne({ chatId: chat._id })
        .sort({ createdAt: -1 })
        .select("createdAt")
        .lean();

      // find the "friend" (not current user) for direct chats
      const friend =
        !chat.isGroup &&
        chat.participants.find((p) => p._id.toString() !== userId.toString());

      // check if user is marked inactive
      const isInactive =
        Array.isArray(chat.inactiveFor) &&
        chat.inactiveFor.some((id) => id.toString() === userId.toString());

      return {
        _id: chat._id,
        isGroup: chat.isGroup,
        name: chat.name,
        friend: friend || null,
        lastMessageTime: lastMsg?.createdAt || chat.updatedAt,
        inactiveFor: chat.inactiveFor || [],
        isInactive, // 🟢 easier for frontend to check
      };
    })
  );

  // 3️⃣ Sort by last message time descending
  chatsWithTime.sort(
    (a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime)
  );

  // 4️⃣ Return sidebar-friendly data
  return res
    .status(200)
    .json(new ApiResponse(200, chatsWithTime, "Recent chats fetched"));
});

// controllers/message.controller.js
const readMessages = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { receiverId, chatId } = req.body;

  if (!receiverId || !chatId)
    throw new ApiError(400, "receiverId and chatId required");

  const unreadMessages = await Message.find({
    chatId,
    sender: receiverId,
    isRead: false,
  }).select("_id");

  if (!unreadMessages.length) {
    return res
      .status(200)
      .json(new ApiResponse(200, { updatedCount: 0 }, "No new messages"));
  }

  await Message.updateMany(
    { _id: { $in: unreadMessages.map((m) => m._id) } },
    { $set: { isRead: true } }
  );

  emitSocketEvent(req, chatId, ChatEventEnum.MESSAGE_READ_EVENT, {
    chatId,
    reader: userId,
    messageIds: unreadMessages.map((m) => m._id.toString()),
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { updatedCount: unreadMessages.length },
        "Messages read"
      )
    );
});

const getUnreadCounts = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // 1. Find all chats where the user participates
  const userChats = await Chat.find({ participants: userId }).select("_id");
  const chatIds = userChats.map((c) => c._id);

  if (!chatIds.length) {
    return res
      .status(200)
      .json(new ApiResponse(200, { data: {} }, "No chats found for user"));
  }

  // 2. Aggregate unread messages + join Chat info
  const unreadMessages = await Message.aggregate([
    {
      $match: {
        isRead: false,
        sender: { $ne: userId },
        chatId: { $in: chatIds },
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $group: {
        _id: "$chatId",
        sender: { $first: "$sender" },
      },
    },
    // 🔹 Join with Chat collection to get isGroup field
    {
      $lookup: {
        from: "chats", // collection name in MongoDB (always lowercase plural)
        localField: "_id",
        foreignField: "_id",
        as: "chatInfo",
      },
    },
    {
      $unwind: "$chatInfo",
    },
    {
      $project: {
        chatId: "$_id",
        senderId: "$sender",
        isGroup: "$chatInfo.isGroup", // ✅ now include isGroup
      },
    },
  ]);

  // 3. Format output: { data: { "0": { chatId, hasUnread, senderId, isGroup } } }
  const result = unreadMessages.reduce((acc, msg, index) => {
    acc[index] = {
      chatId: msg.chatId.toString(),
      hasUnread: true,
      senderId: msg.senderId.toString(),
      isGroup: msg.isGroup || false,
    };
    return acc;
  }, {});

  // 4. Send response
  return res
    .status(200)
    .json(new ApiResponse(200, { data: result }, "Unread chats with group info"));
});


export {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  getRecentChats,
  deleteChat,
  readMessages,
  getUnreadCounts,
};
