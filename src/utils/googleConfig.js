import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

export const oAuth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "postmessage"
);

// ✅ Accept tokens as parameter
export const fetchUserInfo = async (tokens) => {
  try {
    const { data } = await axios.get(
      "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );
    return {data};
  } catch (error) {
    console.error("❌ Failed to fetch Google user info:", error.response?.data || error.message);
    throw new Error("Could not fetch Google user info");
  }
};
