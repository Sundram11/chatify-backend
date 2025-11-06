import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { FriendRequest } from "../models/friendRequest.model.js";
import { User } from "../models/user.model.js";
import mongoose from "mongoose";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import { oAuth2Client, fetchUserInfo } from "../utils/googleConfig.js";

const generateToken = async (userId, res) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found while generating token");

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "strict",
  };

  res
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions);

  return { accessToken, refreshToken };
};

const register = asyncHandler(async (req, res) => {
  const { email, fullName, password } = req.body;

  if (
    [email, fullName, password].some((field) => !field || field.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  if (password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters long");
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(400, "User already exists with this email");
  }

  const newUser = await User.create({
    fullName,
    email,
    password,
  });

  const { accessToken, refreshToken } = await generateToken(newUser._id, res);

  const createdUser = newUser.toObject();
  delete createdUser.password;
  delete createdUser.refreshToken;

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { user: createdUser, accessToken, refreshToken },
        "User registered successfully"
      )
    );
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if ([email, password].some((field) => !field || field.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, "No user found with this email");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid password");
  }

  const { accessToken, refreshToken } = await generateToken(user._id, res);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  const loggedInUser = user.toObject();
  delete loggedInUser.password;
  delete loggedInUser.refreshToken;

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User logged in successfully"
      )
    );
});

const googleSignup = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) throw new ApiError(400, "Code is required");

  let tokens;
  try {
    const result = await oAuth2Client.getToken(code);
    tokens = result.tokens;
    oAuth2Client.setCredentials(tokens);
  } catch {
    throw new ApiError(400, "Invalid or expired Google code");
  }

  const { data } = await fetchUserInfo(tokens);
  const { email, name, picture } = data;
  if (!email) throw new ApiError(400, "Google account has no email");

  let user = await User.findOne({ email });
  if (user) throw new ApiError(401, "User already exists, please login");

  user = await User.create({
    email,
    fullName: name,
    profilePic: picture,
    provider: "google",
  });

  const { accessToken, refreshToken } = await generateToken(user._id, res);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user, accessToken, refreshToken },
        "User signed up successfully"
      )
    );
});

const googleLogin = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) {
    throw new ApiError(400, "Code is required");
  }

  let tokens;
  try {
    const result = await oAuth2Client.getToken(code);
    tokens = result.tokens;
    oAuth2Client.setCredentials(tokens);
  } catch {
    throw new ApiError(400, "Invalid or expired Google code");
  }

  const { data } = await fetchUserInfo(tokens);

  const { email } = data;

  if (!email) throw new ApiError(400, "Google account has no email");

  let user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(401, "User not found please signup");
  }

  const loggedInUser = user.toObject();
  delete loggedInUser.refreshToken;

  const { accessToken, refreshToken } = await generateToken(user._id, res);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User login successfully"
      )
    );
});

const logout = asyncHandler(async (req, res) => {
  if (!req.user || !req.user._id) {
    throw new ApiError(401, "Unauthorized request");
  }

  await User.findByIdAndUpdate(
    req.user._id,
    { $unset: { refreshToken: "" } },
    { new: true }
  );

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "strict",
  };

  return res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const updateProfilePic = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  const profilePicPath = req.file?.path;

  if (!profilePicPath) throw new ApiError(400, "No profile picture provided");

  const response = await uploadOnCloudinary(profilePicPath);

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  if (user.profilePublicId === response.public_id) {
    return res
      .status(200)
      .json(new ApiResponse(200, user, "Avatar already up to date"));
  }

  const oldProfilePublicId = user.profilePublicId;

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        profilePic: response.secure_url,
        profilePublicId: response.public_id,
      },
    },
    { new: true }
  ).select("-password");

  if (oldProfilePublicId) {
    try {
      await deleteFromCloudinary(oldProfilePublicId);
    } catch (err) {
      console.error(
        "Failed to delete old avatar from Cloudinary:",
        err.message
      );
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Avatar updated successfully"));
});

const checkAuth = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "userId not found please login frist");
  }

  res.status(200).json(new ApiResponse(200, req.user, "Authorized user"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) throw new ApiError(401, "Refresh token missing");

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded._id);
    if (!user || user.refreshToken !== refreshToken) {
      throw new ApiError(401, "Invalid or expired refresh token");
    }

    const newAccessToken = user.generateAccessToken();
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "strict",
    };

    res.cookie("accessToken", newAccessToken, cookieOptions);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { accessToken: newAccessToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }
});

const searchUsers = asyncHandler(async (req, res) => {
  const { q = "", page = 1, limit = 10 } = req.query;
  const regex = new RegExp(q, "i");
  const currentUserId = new mongoose.Types.ObjectId(req.user._id);

  const skip = (Number(page) - 1) * Number(limit);

  const pipeline = [
    // 1️⃣ Match users by search query (exclude self)
    {
      $match: {
        _id: { $ne: currentUserId },
        $or: [
          { fullName: { $regex: regex } },
          { email: { $regex: regex } },
        ],
      },
    },

    // 2️⃣ Lookup friend request (if any) between logged-in user and this user
    {
      $lookup: {
        from: "friendrequests",
        let: { otherUserId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  {
                    $and: [
                      { $eq: ["$sender", currentUserId] },
                      { $eq: ["$receiver", "$$otherUserId"] },
                    ],
                  },
                  {
                    $and: [
                      { $eq: ["$receiver", currentUserId] },
                      { $eq: ["$sender", "$$otherUserId"] },
                    ],
                  },
                ],
              },
            },
          },
          { $project: { status: 1, sender: 1, receiver: 1, _id: 0 } },
        ],
        as: "friendRequest",
      },
    },

    // 3️⃣ Add computed field for friend request status
    {
      $addFields: {
        friendRequestStatus: {
          $cond: [
            { $eq: [{ $size: "$friendRequest" }, 0] },
            "none", // No request found
            { $arrayElemAt: ["$friendRequest.status", 0] },
          ],
        },
      },
    },

    // 4️⃣ Project only necessary fields
    {
      $project: {
        fullName: 1,
        email: 1,
        profilePic: 1,
        friendRequestStatus: 1,
      },
    },

    // 5️⃣ Pagination
    { $skip: skip },
    { $limit: Number(limit) },
  ];

  // Run pipeline
  const users = await User.aggregate(pipeline);

  // Count total matching users (without pagination)
  const total = await User.countDocuments({
    _id: { $ne: currentUserId },
    $or: [
      { fullName: { $regex: regex } },
      { email: { $regex: regex } },
    ],
  });

  return res.status(200).json(
    new ApiResponse(200, {
      users,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    })
  );
});

export {
  register,
  login,
  logout,
  updateProfilePic,
  checkAuth,
  googleSignup,
  googleLogin,
  refreshAccessToken,
  searchUsers
};
