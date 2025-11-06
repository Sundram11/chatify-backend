// routes/chat.routes.js
import { Router } from "express";
import { verifyJwt } from "../middleware/auth.middleware.js";
import {
  createOneToOneChatId,
  createGroupChatId,
  findOneToOneChatId,
  findGroupChatId,
} from "../controllers/chat.controller.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

const router = Router();

/**
 * ✅ Create or get 1-to-1 chat
 */
router.post("/one-to-one", verifyJwt, async (req, res, next) => {
  try {
    const user1Id = req.user._id;
    const { participantId } = req.body; // ✅ FIX: destructure properly

    if (!participantId) throw new ApiError(400, "participantId is required");

    const chat = await createOneToOneChatId(user1Id, participantId);

    res
      .status(200)
      .json(new ApiResponse(200, chat, "1-to-1 chat ready"));
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ Find an existing 1-to-1 chat
 */
router.get("/one-to-one/:friendId", verifyJwt, async (req, res, next) => {
  try {
    const chat = await findOneToOneChatId(req.user._id, req.params.friendId);
    res.status(200).json(new ApiResponse(200, chat, "Chat found"));
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ Create group chat
 */
router.post("/group", verifyJwt, async (req, res, next) => {
  try {
    const { name, participantIds } = req.body;

    if (!name || !participantIds?.length) {
      throw new ApiError(400, "Group name and participantIds are required");
    }

    const chat = await createGroupChatId({
      name,
      participantIds: [...new Set([...participantIds, req.user._id])],
      adminId: req.user._id,
    });

    res
      .status(201)
      .json(new ApiResponse(201, chat, "Group chat created successfully"));
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ Get group chat
 */
router.get("/group/:groupId", verifyJwt, async (req, res, next) => {
  try {
    const chat = await findGroupChatId(req.params.groupId);
    res.status(200).json(new ApiResponse(200, chat, "Group chat found"));
  } catch (error) {
    next(error);
  }
});

export default router;
