import { Bot } from "./bot";
import dotenv from "dotenv";
dotenv.config();

(async function main() {
  try {
    console.log("Starting bot...");
    const bot = await Bot.load();
    console.log("Running bot...");
    await bot.run();
  } catch (err) {
    console.error(err);
  }
})();
