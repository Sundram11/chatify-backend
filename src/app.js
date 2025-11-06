import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import errorHandler from "./middleware/globalErrorHandler.js";

// Import Routers
import authRouter from "./routes/auth.route.js";
import messageRouter from "./routes/message.router.js";
import chatRouter from "./routes/chat.route.js";
import friendRouter from "./routes/friend.route.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5000, // max requests per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_, __, ___, options) => {
    return new Error(
      `Too many requests. Max ${options.max} per ${
        options.windowMs / 60000
      } minutes`
    );
  },
});
app.use(limiter);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/message", messageRouter);
app.use("/api/v1/chat", chatRouter);
app.use("/api/v1/friend", friendRouter);

app.use(errorHandler);

export default app;
