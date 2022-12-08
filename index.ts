import Web3 from 'web3';
import * as dotenv from 'dotenv';
import { BigNumber, ethers } from 'ethers';
import {
  TokenChange,
  BlockchainType,
  BalanceChangeEvent,
} from './types/transactions';
import ERC20_ABI from './constant/abi';
import { sampleNativeCoinTx, sampleSwapTx } from './data/sampleTx';

dotenv.config();

const TRANSFER_METHOD_ID = '0xa9059cbb';
const MULTICALL_METHOD_ID = '0x5ae401dc';
const SWAP_METHOD_ID = '0xc10bea5c';
let num_attempts = 0;

function subscribeToWeb3Blocks(web3: Web3) {
  let subscription = web3.eth
    .subscribe('newBlockHeaders', function (error, result) {
      if (!error) {
        return;
      }
    })
    .on('connected', function (subscriptionId) {
      console.log('subscriptionId: ', subscriptionId);
    })
    .on('data', async function (blockHeader) {
      if (num_attempts > Number(process.env.MAX_RPC_ATTEMPTS)) {
        process.abort();
      }
      const blockInfo = await web3.eth.getBlock(blockHeader.hash);
      const transactionsToSort = blockInfo.transactions;

      for (const txHash of transactionsToSort) {
        const tx = await web3.eth.getTransaction(txHash);
        //check if this is a native coin transfer, token transfer or neither
        if (isNativeCoinTransfer(tx)) {
          await emitNativeCoinBalanceChangeEvent(tx, web3);
        } else if (isTokenTransfer(tx, TRANSFER_METHOD_ID)) {
          await emitTokenTransferBalanceChangeEvent(tx, web3);
        } else if (
          isTokenTransfer(tx, MULTICALL_METHOD_ID) ||
          isTokenTransfer(tx, SWAP_METHOD_ID)
        ) {
          await emitSwapTransferBalanceChangeEvent(tx, web3);
        }
      }
    });

  return subscription;
}

function unsubscribe(subscription: any) {
  // unsubscribes the subscription
  subscription.unsubscribe(function (error: any, success: any) {
    if (success) {
      console.log('Successfully unsubscribed!');
      return 'sucess';
    }
  });
}

//if value of a transaction is greater than 0, then tx is a native coin transfer
function isNativeCoinTransfer(tx: any): boolean {
  const txValue = ethers.BigNumber.from(tx.value);
  if (txValue.gt(0)) {
    return true;
  }
  return false;
}

//if the tx.input matches the "transfer" function selector, then tx is a token transfer
//modified to compare methodId to input data
function isTokenTransfer(tx: any, methodId: string): boolean {
  const txData = tx.input;

  let functionSelector = txData.slice(0, 10);
  if (functionSelector === methodId) {
    return true;
  }
  return false;
}

async function emitNativeCoinBalanceChangeEvent(tx: any, web3: Web3) {
  const value = ethers.BigNumber.from(tx.value);

  const gas = ethers.BigNumber.from(tx.gas);
  const gasPrice = ethers.BigNumber.from(tx.gasPrice);
  const txCost = calculateTransactionCost(gas, gasPrice);

  const fromBalance = await getNativeCoinBalance(tx.from, web3);
  const previousFromBalance = fromBalance.add(value).add(txCost);
  const fromBalanceChangeEvent: BalanceChangeEvent = {
    currencyString: 'ETH',
    accountAddress: tx.from,
    accountAddressBlockchain: BlockchainType.Ethereum,
    currentNativeBalance: Number(ethers.utils.formatEther(fromBalance)),
    previousNativeBalance: Number(
      ethers.utils.formatEther(previousFromBalance),
    ),
    transactionCost: Number(ethers.utils.formatEther(txCost)), //gas * gasPrice
    blockHash: tx.blockHash,
    sequenceNumber: tx.blockNumber,
    changeSignature: tx.blockHash,
    tokenChanges: [],
  };

  const toBalance = await getNativeCoinBalance(tx.to, web3);
  const previousToBalance = toBalance.sub(value);
  const toBalanceChangeEvent: BalanceChangeEvent = {
    currencyString: 'ETH',
    accountAddress: tx.to,
    accountAddressBlockchain: BlockchainType.Ethereum,
    currentNativeBalance: Number(ethers.utils.formatEther(toBalance)),
    previousNativeBalance: Number(ethers.utils.formatEther(previousToBalance)),
    transactionCost: 0,
    blockHash: tx.blockHash,
    sequenceNumber: tx.blockNumber,
    changeSignature: tx.blockHash,
    tokenChanges: [],
  };

  console.log('BalanceChangeEvent emitted', fromBalanceChangeEvent);
  console.log('BalanceChangeEvent emitted', toBalanceChangeEvent);
}

async function getNativeCoinBalance(
  address: string,
  web3: Web3,
): Promise<BigNumber> {
  const balance = await web3.eth.getBalance(address);
  return ethers.BigNumber.from(balance);
}

function calculateTransactionCost(
  gas: BigNumber,
  gasPrice: BigNumber,
): BigNumber {
  return gas.mul(gasPrice);
}

async function emitTokenTransferBalanceChangeEvent(tx: any, web3: Web3) {
  //get TokenChange stuff
  const txData = tx.input;
  const inputData = '0x' + txData.slice(10);
  const params = decodeERC20TransferParams(inputData, web3);
  const tokenValue = ethers.BigNumber.from(params._value);

  const tokenContractAddress = tx.to;

  const fromTokenChange: TokenChange = await constructTokenChange(
    tx.from,
    tokenContractAddress,
    'sub',
    tokenValue,
    web3,
  );

  const toTokenChange: TokenChange = await constructTokenChange(
    params._to,
    tokenContractAddress,
    'add',
    tokenValue,
    web3,
  );

  const gas = ethers.BigNumber.from(tx.gas);
  const gasPrice = ethers.BigNumber.from(tx.gasPrice);

  const txCost = calculateTransactionCost(gas, gasPrice);

  const currentNativeCoinBalance = await getNativeCoinBalance(tx.from, web3);
  const previousNativeCoinBalance = currentNativeCoinBalance.sub(txCost);

  const fromBalanceChangeEvent: BalanceChangeEvent = {
    currencyString: 'ETH',
    accountAddress: tx.from,
    accountAddressBlockchain: BlockchainType.Ethereum,
    currentNativeBalance: Number(
      ethers.utils.formatEther(currentNativeCoinBalance),
    ),
    previousNativeBalance: Number(
      ethers.utils.formatEther(previousNativeCoinBalance),
    ),
    transactionCost: Number(ethers.utils.formatEther(txCost)),
    blockHash: tx.blockHash,
    sequenceNumber: tx.blockNumber,
    changeSignature: tx.hash,
    tokenChanges: [fromTokenChange],
  };

  const toCurrentNativeCoinBalance = await getNativeCoinBalance(
    params._to,
    web3,
  );
  const toBalanceChangeEvent: BalanceChangeEvent = {
    currencyString: 'ETH',
    accountAddress: params._to,
    accountAddressBlockchain: BlockchainType.Ethereum,
    currentNativeBalance: Number(
      ethers.utils.formatEther(toCurrentNativeCoinBalance),
    ),
    previousNativeBalance: Number(
      ethers.utils.formatEther(toCurrentNativeCoinBalance),
    ),
    transactionCost: 0,
    blockHash: tx.blockHash,
    sequenceNumber: tx.blockNumber,
    changeSignature: tx.hash,
    tokenChanges: [toTokenChange],
  };

  console.log('BalanceChangeEvent emitted', fromBalanceChangeEvent);
  console.log('BalanceChangeEvent emitted', toBalanceChangeEvent);
}

function decodeERC20TransferParams(input: string, web3: Web3) {
  let params = web3.eth.abi.decodeParameters(['address', 'uint256'], input);
  return { _to: params['0'], _value: params['1'] };
}

// ! Assumes ERC20 decimal = 18 (USDC is 6 decimals)
async function constructTokenChange(
  walletAddress: string,
  tokenContractAddress: string,
  arithmetic: string,
  tokenValue: BigNumber,
  web3: Web3,
) {
  const contract = new web3.eth.Contract(ERC20_ABI, tokenContractAddress);

  //get Symbol
  const symbol = await contract.methods.symbol().call();

  //get postAmount,
  const postTokenBalance = ethers.BigNumber.from(
    await contract.methods.balanceOf(walletAddress).call(),
  );

  //get preAmount
  let previousTokenBalance: BigNumber = ethers.BigNumber.from(0);

  if (arithmetic == 'sub') {
    previousTokenBalance = postTokenBalance.sub(tokenValue);
  } else if (arithmetic == 'add') {
    previousTokenBalance = postTokenBalance.add(tokenValue);
  }

  let tokenChange: TokenChange = {
    symbol: symbol,
    tokenContractAddress: tokenContractAddress,
    preAmount: Number(ethers.utils.formatEther(previousTokenBalance)),
    postAmount: Number(ethers.utils.formatEther(postTokenBalance)),
  };

  return tokenChange;
}

//treat swap tx like multiCall tx
async function emitSwapTransferBalanceChangeEvent(tx: any, web3: Web3) {
  //get All TokenChangeEvents
  const txHash = tx['hash'];
  const txLogs = await getTransactionLogs(txHash, web3);
  const tokenChangesEvents = await generateTokenChangeEvents(txLogs, web3);

  const gas = ethers.BigNumber.from(tx.gas);
  const gasPrice = ethers.BigNumber.from(tx.gasPrice);

  const txCost = calculateTransactionCost(gas, gasPrice);

  const currentNativeCoinBalance = await getNativeCoinBalance(tx.from, web3);
  const previousNativeCoinBalance = currentNativeCoinBalance.sub(txCost);

  const balanceChangeEvent: BalanceChangeEvent = {
    currencyString: 'ETH',
    accountAddress: tx.from,
    accountAddressBlockchain: BlockchainType.Ethereum,
    currentNativeBalance: Number(
      ethers.utils.formatEther(currentNativeCoinBalance),
    ),
    previousNativeBalance: Number(
      ethers.utils.formatEther(previousNativeCoinBalance),
    ),
    transactionCost: Number(ethers.utils.formatEther(txCost)),
    blockHash: tx.blockHash,
    sequenceNumber: tx.blockNumber,
    changeSignature: tx.hash,
    tokenChanges: tokenChangesEvents,
  };

  console.log('balanceChangeEvent', balanceChangeEvent);
}

async function getTransactionLogs(
  txHash: string,
  web3: Web3,
): Promise<Object[]> {
  const receipt = await web3.eth.getTransactionReceipt(txHash);
  const logs = receipt.logs;
  return logs;
}

async function generateTokenChangeEvents(logs: any, web3: Web3) {
  const result: TokenChange[] = [];
  const TransferHash =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

  for (const log of logs) {
    const functionHexValue: any = log['topics'][0];
    if (functionHexValue == TransferHash) {
      const inputs = [
        { type: 'address', name: 'from', indexed: true },
        { type: 'address', name: 'to', indexed: true },
        { type: 'uint256', name: 'value' },
      ];
      const data = log['data'];
      const topics = log['topics'];
      topics.shift();
      const value = log['data'];
      topics.push(value);
      const decodedLog = web3.eth.abi.decodeLog(inputs, data, topics);

      const fromAddress = decodedLog['0'];
      const toAddress = decodedLog['1'];
      const amt = ethers.BigNumber.from(decodedLog['2']);

      const tokenContractAddress = log['address'];

      const tokenChangeEvent1 = await constructTokenChange(
        fromAddress,
        tokenContractAddress,
        'sub',
        ethers.BigNumber.from(value),
        web3,
      );
      const tokenChangeEvent2 = await constructTokenChange(
        toAddress,
        tokenContractAddress,
        'add',
        ethers.BigNumber.from(value),
        web3,
      );
      result.push(tokenChangeEvent1);
      result.push(tokenChangeEvent2);
    }
  }
  return result;
}

async function main() {
  const RPC: string = process.env.DEV_ETH_RPC ?? '';
  const web3 = new Web3(RPC);

  const subscription = subscribeToWeb3Blocks(web3);
}

main();
