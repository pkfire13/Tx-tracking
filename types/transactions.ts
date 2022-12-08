export interface TokenChange {
  symbol: string;
  tokenContractAddress: string;
  preAmount: number; // Converted to decimals based on token information
  postAmount: number; // Converted to decimals based on token information
}

export enum BlockchainType {
  Solana = 0,
  Near,
  Ethereum,
}

export interface BalanceChangeEvent {
  currencyString: string;
  accountAddress: string;
  accountAddressBlockchain: BlockchainType;
  currentNativeBalance: number; // Converted to decimals
  previousNativeBalance: number; // Converted to decimals
  transactionCost: number; // Converted to decimals
  blockHash?: string;
  sequenceNumber: number; // Block number
  changeSignature: string; // Transaction signature
  tokenChanges: TokenChange[];
}

export default BalanceChangeEvent;
