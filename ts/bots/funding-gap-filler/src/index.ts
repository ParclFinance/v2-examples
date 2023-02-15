import { Bot } from "./bot";
import chalk from "chalk";
import dotenv from "dotenv";
dotenv.config();

(async function main() {
  try {
    console.log(chalk.green("Starting bot..."));
    const bot = await Bot.load();
    console.log(chalk.green("Running bot..."));
    await bot.run();
  } catch (err) {
    console.error(err);
  }
})();
