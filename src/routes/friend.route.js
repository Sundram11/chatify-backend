import { Router } from "express";
import { verifyJwt } from "../middleware/auth.middleware.js";
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getPendingRequests,
  unfollowFriend,
  getSentRequests,
  getAllActiveFriends
} from "../controllers/friend.controller.js";

const router = Router();

// Protected routes
router.post("/send", verifyJwt, sendFriendRequest);
router.post("/accept", verifyJwt, acceptFriendRequest);
router.post("/reject", verifyJwt, rejectFriendRequest);
router.get("/pending", verifyJwt, getPendingRequests);
router.get("/sentRequest", verifyJwt, getSentRequests);
router.post("/unfollow", verifyJwt, unfollowFriend);
router.get("/allActiveFriends", verifyJwt, getAllActiveFriends);

export default router;
