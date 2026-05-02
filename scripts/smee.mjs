import "dotenv/config";
import SmeeClient from "smee-client";

const url = process.env.SMEE_URL;
if (!url) {
  console.error("SMEE_URL is not set in .env");
  process.exit(1);
}

const client = new SmeeClient({
  source: url,
  target: "http://localhost:3000/api/github/webhook",
  logger: console,
});

client.start();
