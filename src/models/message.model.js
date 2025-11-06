import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true, // Faster chat lookups
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Improves sender-based queries
    },
    text: {
      type: String,
      trim: true,
      default: "", // so it never becomes undefined
    },
    fileUrl: {
      type: String,
      default: null,
    },
    filePublicId: {
      type: String, // ✅ Required for Cloudinary delete
      default: null,
    },
    messageType: {
      type: String,
      enum: ["text", "image", "video", "audio", "file"],
      default: "text",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    isDeletedForEveryone: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// ✅ Indexing for performance
messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ isRead: 1, sender: 1 });


// ✅ Virtual for message preview (used in recent chats, etc.)
messageSchema.virtual("preview").get(function () {
  if (this.text) return this.text.slice(0, 50);
  if (this.fileUrl) {
    const typeIcon =
      this.messageType === "image"
        ? "🖼️"
        : this.messageType === "video"
        ? "🎬"
        : this.messageType === "audio"
        ? "🎧"
        : "📎";
    return `${typeIcon} Media file`;
  }
  return "";
});

// ✅ Ensure virtuals are included in JSON responses
messageSchema.set("toJSON", { virtuals: true });
messageSchema.set("toObject", { virtuals: true });

export const Message = mongoose.model("Message", messageSchema);
