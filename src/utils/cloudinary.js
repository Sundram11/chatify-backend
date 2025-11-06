// utils/cloudinary.js
import { v2 as cloudinary } from "cloudinary";
import { ApiError } from "./ApiError.js";

cloudinary.config({
  secure: true, // Uses CLOUDINARY_URL from .env automatically
});

const uploadOnCloudinary = async (profilePic) => {
  try {
    const uploadResponse = await cloudinary.uploader.upload(profilePic, {
      resource_type: "auto",
    });
    return uploadResponse;
  } catch (error) {
    console.error("❌ Cloudinary upload failed:", error.message);
    throw new ApiError(500, "Cloudinary upload failed");
  }
};

const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return null;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("❌ Cloudinary delete failed:", error.message);
  }
};

export { uploadOnCloudinary, deleteFromCloudinary };
