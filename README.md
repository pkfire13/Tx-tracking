# interview-assignment-paulkim

Methodogy:

The first approach I took when I saw the "watching for each block" phrase was a websocket where the web3 subscription would emit events with callbacks. https://web3js.readthedocs.io/en/v1.8.0/web3-eth-subscribe.html. I first tried using the "logs" option and filtered based on "topics" which would be the hash of the method and its input types. This would at least cover the token transfer but native coin transfers do not have logs. I decided to use the "newBlockHeader" to get the transactions in each block whenever an callback was emitted. To distinguish between different types of transfers, I would use the following method.

1. Native Coins: tx.value > 0
2. Token Transfers: tx.input string be sliced to show the function selector portion (first 10 characters) and should match the method ID of Transfer, Multicall, or Swap.

From there, I was able to extract all the attributes of the BalanceChangeEvent from the tx object. With the tokenChange interface, I complied a ERC20 contract ABI and create an web3.eth.Contract object and leveraged the abi to call different read methods.

Considerations:

1. multicall/swap transactions should have multiple tokenChanges however I am having trouble parsing the input of the web3 transaction object as the data can vary greatly. I initally thought I could recursively add tokenChange objects as I reduced the tx.input but inputs for each transfer call can differ (mints, burns, transferFrom, other future ERC methods) but I felt that this problem needed additional attention/guidance to solve. I'm open to suggestions and hints to figure this out.
2. Numbers representing address's token balances should account for decimal places (example USDC uses 6 decimals and mainstream ERC20 tokens uses 18 decimals) however, my code uses formatEther method to normalize balances on the tokenChanges
3. The amount of RPC calls should be reduced if possible since I am iterating through each tx on the block (resulting to at least 1 RPC call per tx). I ended up racking hundreds of RPC calls per minute and I'm not sure at what magnitude is acceptable. Again, open to suggestions here
4. Some receipent BalanceChangeEvents would have a negative previousNativeCoinBalance if the receipent is a router like Uniswap V3 Router

Total hours spent: 7

# Startup

npm install

npm run start
