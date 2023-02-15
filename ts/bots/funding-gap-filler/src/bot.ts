import { BN, Address, translateAddress, ProgramAccount } from "@project-serum/anchor";
import { PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import Decimal from "decimal.js";
import { ParclV2Client } from "./client";
import { Pool, Position, OpenPositionAmounts, SkewInfo } from "./types";
import { getPositionPda, getUnsettledCollateralAccountPda } from "./utils";

const TRADE_SIZE_PERCENT_OF_MAX_SIZE = 0.95; // 95%
const LEVERAGE = 10;
const SMALLEST_COLLATERAL_AMOUNT = new BN(500_000); // 50 cents

export class Bot {
  client: ParclV2Client;
  owner: PublicKey;
  pool: ProgramAccount<Pool>;
  skewInfo: SkewInfo;
  currentPosition: PublicKey;

  constructor(
    client: ParclV2Client,
    owner: PublicKey,
    poolAddress: Address,
    currentPosition: PublicKey
  ) {
    this.client = client;
    this.owner = owner;
    this.pool = { publicKey: translateAddress(poolAddress), account: {} as Pool };
    this.skewInfo = {} as SkewInfo;
    this.currentPosition = currentPosition;
  }

  static async load(): Promise<Bot> {
    const client = ParclV2Client.load();
    const poolAddress = process.env.POOL_ADDRESS;
    if (poolAddress === undefined) {
      throw new Error("Cannot find pool address");
    }
    const { id } = await client.getPositions(client.wallet.publicKey, poolAddress);
    const [currentPosition] = getPositionPda(
      poolAddress,
      client.wallet.publicKey,
      id.isZero() ? id : id.sub(new BN(1)),
      client.program.programId
    );
    return new Bot(client, client.wallet.publicKey, poolAddress, currentPosition);
  }

  async run(): Promise<void> {
    const [position, pool] = await Promise.all([
      this.client.program.provider.connection.getAccountInfo(this.currentPosition),
      this.client.program.account.pool.fetch(this.pool.publicKey) as Promise<Pool>,
    ]);
    this.setPool(pool);
    this.setSkewInfo(this.getSkewInfo(pool));
    // If position is uninitialized, open a new position on the minority side
    if (position === null) {
      await this.sendOpenPositionTx(this.skewInfo.skew);
    } else {
      // Otherwise, check if there is a opportunity to fill a funding gap
      await this.tryExecuteTrade();
    }
    // Subscribe to changes to the pool account
    this.client.program.provider.connection.onAccountChange(
      this.pool.publicKey,
      async (accountInfo) => {
        try {
          const pool = this.decodePool(accountInfo.data);
          this.setPool(pool);
          this.setSkewInfo(this.getSkewInfo(pool));
          // Check if there is a opportunity to fill a funding gap
          await this.tryExecuteTrade();
        } catch (err) {
          console.error(err);
        }
      }
    );
  }

  async tryExecuteTrade(): Promise<void> {
    console.log(`${new Date()}: Trying to execute trade...`);
    const currentPosition = (await this.client.program.account.position.fetchNullable(
      this.currentPosition
    )) as Position;
    if (currentPosition === null) return;
    // Calculate skew after bot closes its current open position
    const { skew, maxTradeSize } = this.getMaxTradeSizeAndSimulatedSkew(currentPosition);
    // Short circuit if trade size is less than the smallest allowed amount
    if (maxTradeSize.lte(SMALLEST_COLLATERAL_AMOUNT)) return;
    // Get unleveraged collateral amount and unsettled collateral amount to use for the open position instruction
    const { amount, unsettledAmount } = await this.getOpenPositionAmounts(maxTradeSize);
    console.log(`${new Date()}:`);
    console.log({
      currentSkew: skew.div(1e6),
      maxTradeSize: maxTradeSize.divn(1e6).toString(),
      leverage: LEVERAGE,
      amount: amount.divn(1e6).toString(),
      unsettledAmount: unsettledAmount.divn(1e6).toString(),
      direction: !skew.isPositive() ? "Long" : "Short",
    });
    // Get transaction that:
    //  1. Closes current position
    //  2. Opens a new position to fill the funding gap
    const { tx, newPosition } = await this.client.getExecuteTradeTx({
      direction: !skew.isPositive(),
      leverage: LEVERAGE,
      amount,
      unsettledAmount,
      position: this.currentPosition,
      liquidityTokenMint: this.pool.account.liquidityTokenMint,
      pool: this.pool.publicKey,
      priceFeed: this.pool.account.priceFeed,
      collateralMint: this.pool.account.collateralMint,
      owner: this.owner,
    });
    // Send transaction
    const signature = await sendAndConfirmTransaction(this.client.program.provider.connection, tx, [
      this.client.wallet.payer,
    ]);
    console.log(`${new Date()}: Execute Trade Signature: ${signature}`);
    this.currentPosition = newPosition;
  }

  async sendOpenPositionTx(skew: Decimal): Promise<void> {
    console.log(`${new Date()}: Trying to open a position...`);
    const maxTradeSize = new BN(
      skew.abs().mul(TRADE_SIZE_PERCENT_OF_MAX_SIZE).div(LEVERAGE).floor().toString()
    );
    // Short circuit if trade size is less than smallest allowed amount
    if (maxTradeSize.lte(SMALLEST_COLLATERAL_AMOUNT)) return;
    const { amount, unsettledAmount } = await this.getOpenPositionAmounts(maxTradeSize);
    // Get open position transaction
    const tx = await this.client.getOpenPositionTx({
      direction: !skew.isPositive(),
      leverage: LEVERAGE,
      amount,
      unsettledAmount,
      position: this.currentPosition,
      pool: this.pool.publicKey,
      priceFeed: this.pool.account.priceFeed,
      collateralMint: this.pool.account.collateralMint,
      owner: this.owner,
    });
    // Send transaction
    const signature = await sendAndConfirmTransaction(this.client.program.provider.connection, tx, [
      this.client.wallet.payer,
    ]);
    console.log(`${new Date()}: Open Position Signature: ${signature}`);
  }

  getMaxTradeSizeAndSimulatedSkew(currentPosition: Position): { skew: Decimal; maxTradeSize: BN } {
    const currentPositionSize = new Decimal(
      currentPosition.collateralAmount.muln(currentPosition.leverage).toString()
    );
    const openInterestLong = currentPosition.direction
      ? this.skewInfo.openInterestLong.sub(currentPositionSize)
      : this.skewInfo.openInterestLong;
    const openInterestShort = !currentPosition.direction
      ? this.skewInfo.openInterestShort.sub(currentPositionSize)
      : this.skewInfo.openInterestShort;
    const skew = openInterestLong.sub(openInterestShort);
    const maxTradeSize = new BN(
      skew.abs().mul(TRADE_SIZE_PERCENT_OF_MAX_SIZE).div(LEVERAGE).floor().toString()
    );
    return { skew, maxTradeSize };
  }

  async getOpenPositionAmounts(size: BN): Promise<OpenPositionAmounts> {
    const unsettledCollateralAccount =
      await this.client.program.account.unsettledCollateralAccount.fetchNullable(
        getUnsettledCollateralAccountPda(this.owner, this.client.program.programId)[0]
      );
    return unsettledCollateralAccount === null
      ? { amount: size, unsettledAmount: new BN(0) }
      : size >= unsettledCollateralAccount.pendingAmount
      ? {
          amount: size.sub(unsettledCollateralAccount.pendingAmount),
          unsettledAmount: unsettledCollateralAccount.pendingAmount,
        }
      : { amount: new BN(0), unsettledAmount: size };
  }

  setPool(pool: Pool): void {
    this.pool.account = pool;
  }

  setSkewInfo(skewInfo: SkewInfo): void {
    this.skewInfo = skewInfo;
  }

  decodePool(data: Buffer): Pool {
    return this.client.program.account.pool.coder.accounts.decode("pool", data);
  }

  getSkewInfo(pool: Pool): SkewInfo {
    const openInterestLong = new Decimal(pool.skewManager.openInterestLong.toString());
    const openInterestShort = new Decimal(pool.skewManager.openInterestShort.toString());
    const cumulativeFundingRate = new Decimal(pool.skewManager.cumulativeFundingRate.toString());
    const skew = openInterestLong.sub(openInterestShort);
    return {
      skew,
      openInterestLong,
      openInterestShort,
      cumulativeFundingRate,
    };
  }
}
