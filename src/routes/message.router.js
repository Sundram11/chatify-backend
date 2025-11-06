import { Router } from "express";
import { verifyJwt } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import {
  getRecentChats,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  deleteChat,
  readMessages,
  getUnreadCounts
} from "../controllers/message.controller.js";

const router = Router();

// 🛡️ All routes protected
router.use(verifyJwt);

// ✅ Get friends and groups
router.get("/recent-chats", getRecentChats);

// ✅ Get all messages in a chat (1-1 or group)
router.get("/:chatId/messages", getMessages);

// ✅ Send a message (supports media)
router.post("/send", upload.single("file"), sendMessage);

// ✅ Edit message
router.put("/edit/:messageId", editMessage);

// ✅ Delete message
router.delete("/delete/:messageId", deleteMessage);

router.delete("/:chatId/delete", verifyJwt, deleteChat);

router.put("/read", verifyJwt, readMessages);

router.get("/unreadCounts", verifyJwt, getUnreadCounts);

export default router;
