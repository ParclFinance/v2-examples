import { utils } from "@project-serum/anchor";
import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";

export function loadKeypair(): Keypair {
  const secretKeyText =
    process.env.PRIVATE_KEY !== undefined
      ? utils.bytes.bs58.decode(process.env.PRIVATE_KEY)
      : JSON.parse(
          fs.readFileSync(os.homedir() + "/.config/solana/id.json", {
            encoding: "utf-8",
          })
        );
  if (secretKeyText === undefined) {
    throw new Error(
      "Cannot find signer! Bot needs base58 encoded private key from ENV or Solana CLI default keypair."
    );
  }
  return Keypair.fromSecretKey(Buffer.from(secretKeyText));
}
