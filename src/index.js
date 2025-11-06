import dotenv from "dotenv";
import connectDB from "./db/db.js";
import app from "./app.js";
import { initSocket } from "./socket.js";

dotenv.config();

// initialize socket.io and get HTTP server
const { server } = initSocket(app);

connectDB()
  .then(() => {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err);
    process.exit(1); // stop server if DB fails
  });
