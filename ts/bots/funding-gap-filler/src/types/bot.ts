import { BN } from "@project-serum/anchor";

export type OpenPositionAmounts = {
  amount: BN;
  unsettledAmount: BN;
};
