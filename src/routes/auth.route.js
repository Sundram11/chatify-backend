import { Router } from "express";
import { verifyJwt } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/multer.middleware.js";
import {
  register,
  login,
  logout,
  updateProfilePic,
  checkAuth,
  googleSignup,
  googleLogin,
  refreshAccessToken,
  searchUsers
} from "../controllers/auth.controller.js";

const router = Router();

// Public routes
router.post("/signup", register);
router.post("/login", login);
router.post("/google-signup", googleSignup);
router.post("/google-login", googleLogin);
router.post("/refresh-token", refreshAccessToken);
router.get("/users/search", verifyJwt, searchUsers);


// Protected routes
router.post("/logout", verifyJwt, logout);
router.put("/update-profile", verifyJwt, upload.single("profilePic"), updateProfilePic);
router.get("/checkAuth", verifyJwt, checkAuth);

export default router;
