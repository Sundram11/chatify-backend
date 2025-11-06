import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { FriendRequest } from "../models/friendRequest.model.js";
import { Chat } from "../models/Chat.model.js";
import { emitSocketEvent } from "./socket.controller.js";

// ✅ Send Friend Request
export const sendFriendRequest = asyncHandler(async (req, res) => {
  const senderId = req.user._id;
  const { receiverId } = req.body;

  if (!receiverId) throw new ApiError(400, "Receiver ID is required");
  if (senderId.toString() === receiverId.toString())
    throw new ApiError(400, "Cannot send request to yourself");

  // 🟨 Check existing
  const existing = await FriendRequest.findOne({
    $or: [
      { sender: senderId, receiver: receiverId },
      { sender: receiverId, receiver: senderId },
    ],
  });

  if (existing) {
    if (existing.status === "pending") {
      throw new ApiError(400, "Friend request already pending");
    }

    // Reuse old request
    existing.status = "pending";
    existing.sender = senderId;
    existing.receiver = receiverId;
    await existing.save();

    emitSocketEvent(req, receiverId.toString(), "friend_request_received", {
      requestId: existing._id,
      senderId,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, existing, "Friend request resent"));
  }

  // 🟩 Create new
  const newRequest = await FriendRequest.create({
    sender: senderId,
    receiver: receiverId,
  });

  emitSocketEvent(req, receiverId.toString(), "friend_request_received", {
    requestId: newRequest._id,
    senderId,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, newRequest, "Friend request sent"));
});

// ✅ Accept Friend Request
export const acceptFriendRequest = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { requestId } = req.body;

  if (!requestId) throw new ApiError(400, "Request ID is required");

  const request = await FriendRequest.findById(requestId);
  if (!request) throw new ApiError(404, "Friend request not found");
  if (request.receiver.toString() !== userId.toString())
    throw new ApiError(403, "Not authorized to accept this request");

  // ✅ 1️⃣ Update request status
  request.status = "accepted";
  await request.save({ validateBeforeSave: false });

  // ✅ 2️⃣ Reactivate chat if previously inactive
  const reactivateChat = async (userA, userB) => {
    const chat = await Chat.findOne({
      isGroup: false,
      participants: { $all: [userA, userB] },
    });

    if (chat) {
      chat.inactiveFor = chat.inactiveFor.filter(
        (id) =>
          id.toString() !== userA.toString() &&
          id.toString() !== userB.toString()
      );
      await chat.save({ validateBeforeSave: false });
    }
  };

  await reactivateChat(request.sender, request.receiver);

  // ✅ 3️⃣ Notify sender
  emitSocketEvent(req, request.sender.toString(), "friend_request_accepted", {
    requestId: request._id,
    receiverId: userId,
  });

  // ✅ 4️⃣ Respond
  return res
    .status(200)
    .json(new ApiResponse(200, request, "Friend request accepted"));
});

// ✅ Reject Friend Request
export const rejectFriendRequest = asyncHandler(async (req, res) => {
  const receiverId = req.user._id;
  const { requestId } = req.body;

  if (!requestId) throw new ApiError(400, "Request ID is required");

  const request = await FriendRequest.findById(requestId);
  if (!request) throw new ApiError(404, "Request not found");

  if (request.receiver.toString() !== receiverId.toString())
    throw new ApiError(403, "You cannot reject this request");

  request.status = "rejected";
  await request.save({ validateBeforeSave: false });

  // 🚀 Notify sender
  emitSocketEvent(req, request.sender.toString(), "friend_request_rejected", {
    requestId,
    receiverId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Friend request rejected"));
});

// ✅ Get Pending Friend Requests
export const getPendingRequests = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const requests = await FriendRequest.find({
    receiver: userId,
    status: "pending",
  }).populate("sender", "fullName email profilePic");

  // 🧠 Transform data → put status inside sender
  const formattedRequests = requests.map((req) => ({
    ...req.sender.toObject(),
    friendRequestStatus: req.status,
    requestId: req._id, // optional, if you still need it later
  }));

  return res
    .status(200)
    .json(
      new ApiResponse(200, formattedRequests, "Pending friend requests fetched")
    );
});

export const getSentRequests = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // 🔍 Find requests where current user is sender
  const requests = await FriendRequest.find({
    sender: userId,
    status: { $in: ["pending", "rejected"] }, // both pending and rejected
  }).populate("receiver", "fullName email profilePic");

  const formattedRequests = requests.map((req) => ({
    ...req.receiver.toObject(),
    friendRequestStatus: req.status,
    requestId: req._id, // optional, if you still need it later
  }));
  return res
    .status(200)
    .json(
      new ApiResponse(200, formattedRequests, "Sent friend requests fetched")
    );
});

// ✅ Unfollow (mark chat inactive)
export const unfollowFriend = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { friendId } = req.body;

  if (!friendId) throw new ApiError(400, "friendId is required");

  // 🟩 1️⃣ Update FriendRequest status if it exists
  const friendRequest = await FriendRequest.findOne({
    $or: [
      { sender: userId, receiver: friendId },
      { sender: friendId, receiver: userId },
    ],
    status: "accepted",
  });

  if (friendRequest) {
    await FriendRequest.deleteOne({ _id: friendRequest._id });
  }

  // 🟩 2️⃣ Find chat (one-to-one or group containing both)
  const chat = await Chat.findOne({
    isGroup: false,
    participants: { $all: [userId, friendId] },
  });

  if (chat) {
    // ✅ Add both users to inactiveFor (so both lose access)
    const inactiveSet = new Set(chat.inactiveFor.map((id) => id.toString()));
    inactiveSet.add(userId.toString());
    inactiveSet.add(friendId.toString());
    chat.inactiveFor = Array.from(inactiveSet);

    await chat.save({ validateBeforeSave: false });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Unfollowed successfully"));
});

export const getAllActiveFriends = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // 🟩 1️⃣ Find all accepted friend requests where the current user is involved
  const acceptedRequests = await FriendRequest.find({
    status: "accepted",
    $or: [{ sender: userId }, { receiver: userId }],
  })
    .populate("sender", "fullName email profilePic")
    .populate("receiver", "fullName email profilePic");

  // 🟩 2️⃣ Format data to include only the friend (not current user)
  const formattedFriends = acceptedRequests.map((req) => {
    const friend =
      req.sender._id.toString() === userId.toString()
        ? req.receiver
        : req.sender;

    return {
      ...friend.toObject(),
      friendRequestStatus: req.status,
      requestId: req._id,
    };
  });

  // 🟩 3️⃣ Send consistent formatted response
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        formattedFriends,
        "Active friends fetched successfully"
      )
    );
});
