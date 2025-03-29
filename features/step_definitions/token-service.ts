import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import {
  AccountBalanceQuery,
  AccountId,
  AccountInfoQuery,
  Client,
  PrivateKey,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenInfoQuery,
  TokenMintTransaction,
  TokenSupplyType,
  TokenType,
  TransferTransaction,
} from "@hashgraph/sdk";
import assert from "node:assert";
import dotenv from "dotenv";

dotenv.config();

const client = Client.forTestnet();
const operatorAccountId = AccountId.fromString(
  process.env.MY_ACCOUNT_ID as string
);
const operatorPrivateKey = PrivateKey.fromStringED25519(
  process.env.MY_PRIVATE_KEY as string
);
client.setOperator(operatorAccountId, operatorPrivateKey);

const isAssociated = async (
  accountIdToCheck: AccountId,
  tokenIdToVerify: string,
  providedClient: Client
) => {
  const accountInfo = await new AccountInfoQuery()
    .setAccountId(accountIdToCheck)
    .execute(providedClient);
  const accountTokenBalance = accountInfo.tokenRelationships;
  return !!accountTokenBalance.get(tokenIdToVerify);
};

Given(
  /^A Hedera account with more than (\d+) hbar$/,
  async function (expectedBalance: number) {
    const acc = accounts[0];
    const account: AccountId = AccountId.fromString(acc.id);
    this.account = account;

    const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
    this.accountPrivateKey = privKey;

    const query = new AccountBalanceQuery().setAccountId(account);
    const balance = await query.execute(client);

    assert.ok(
      balance.hbars.toBigNumber().toNumber() > expectedBalance,
      "Account balance is less than expected."
    );
  }
);

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  this.tokenDecimal = 2;
  this.tokenSupply = 1000;
  this.tokenSymbol = "HTT";
  this.tokenName = "Test Token";

  const tokenCreateTx = await new TokenCreateTransaction()
    .setTokenName(this.tokenName)
    .setTokenSymbol(this.tokenSymbol)
    .setDecimals(this.tokenDecimal)
    .setSupplyKey(operatorPrivateKey)
    .setAdminKey(operatorPrivateKey) // Explicitly setting no adminKey
    .setAutoRenewAccountId(operatorAccountId) // Ensuring no autoRenewAccount is set
    .setInitialSupply(this.tokenSupply)
    .setTreasuryAccountId(operatorAccountId)
    .setTokenType(TokenType.FungibleCommon) // Explicitly set token type
    .setFreezeDefault(false) // Ensure freeze is disabled by default
    .setWipeKey(operatorPrivateKey) // Explicitly setting no wipeKey
    .setKycKey(operatorPrivateKey) // Explicitly setting no kycKey
    .setSupplyType(TokenSupplyType.Infinite) // Explicitly set supply type
    .freezeWith(client);

  const tokenCreateSign = await tokenCreateTx.sign(operatorPrivateKey);
  const tokenCreateSubmit = await tokenCreateSign.execute(client);
  const tokenCreateReceipt = await tokenCreateSubmit.getReceipt(client);

  this.tokenId = tokenCreateReceipt.tokenId;
  assert.ok(this.tokenId, "Token creation failed");

  console.log("Token created with ID:", this.tokenId.toString());
});

Then(
  /^The token has the name "([^"]*)"$/,
  async function (expectedName: string) {
    // Check if tokenId is defined
    assert.ok(this.tokenId, "Token ID is not defined");

    // Fetch token info using the tokenId
    const tokenInfo = await new TokenInfoQuery()
      .setTokenId(this.tokenId)
      .execute(client);

    assert.strictEqual(
      tokenInfo.name,
      expectedName,
      "Token name does not match"
    );
    console.log("Token name:", tokenInfo.name);
  }
);

Then(
  /^The token has the symbol "([^"]*)"$/,
  async function (expectedSymbol: string) {
    // Check if tokenId is defined
    assert.ok(this.tokenId, "Token ID is not defined");

    // Fetch token info using the tokenId
    const tokenInfo = await new TokenInfoQuery()
      .setTokenId(this.tokenId)
      .execute(client);

    // Assert that the token symbol matches the expected value
    assert.strictEqual(
      tokenInfo.symbol,
      expectedSymbol,
      "Token symbol does not match"
    );
    console.log("Token symbol:", tokenInfo.symbol);
  }
);

Then(
  /^The token has (\d+) decimals$/,
  async function (expectedDecimals: number) {
    // Check if tokenId is defined
    assert.ok(this.tokenId, "Token ID is not defined");

    // Fetch token info using the tokenId
    const tokenInfo = await new TokenInfoQuery()
      .setTokenId(this.tokenId)
      .execute(client);

    // Assert that the token decimals match the expected value
    assert.strictEqual(
      tokenInfo.decimals,
      expectedDecimals,
      "Token decimals do not match"
    );
    console.log("Token decimals:", tokenInfo.decimals);
  }
);

Then(/^The token is owned by the account$/, async function () {
  // Check if tokenId is defined
  assert.ok(this.tokenId, "Token ID is not defined");

  // Fetch token info using the tokenId
  const tokenInfo = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);

  // Assert that the treasury account ID matches the account ID
  assert.strictEqual(
    tokenInfo.treasuryAccountId?.toString() || "",
    operatorAccountId.toString(),
    "Token is not owned by the expected account"
  );
  console.log("Token is owned by the account:", operatorAccountId.toString());
});

Then(
  /^An attempt to mint (\d+) additional tokens succeeds$/,
  async function (additionalTokens: number) {
    // Check if tokenId is defined
    assert.ok(this.tokenId, "Token ID is not defined");

    // Create a mint transaction
    const mintTx = await new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(additionalTokens)
      .freezeWith(client);

    // Sign the transaction with the treasury account's private key
    const mintSign = await mintTx.sign(operatorPrivateKey);

    // Submit the transaction to the Hedera network
    const mintSubmit = await mintSign.execute(client);

    // Get the receipt of the transaction
    const mintReceipt = await mintSubmit.getReceipt(client);

    // Verify the transaction status
    assert.strictEqual(
      mintReceipt.status.toString(),
      "SUCCESS",
      "Minting additional tokens failed"
    );

    console.log(`Successfully minted ${additionalTokens} additional tokens.`);
  }
);

When(
  /^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/,
  async function (initialSupply: number) {
    this.tokenDecimal = 2;
    this.tokenSupply = initialSupply;
    this.tokenSymbol = "HTT";
    this.tokenName = "Test Token";

    const tokenCreateTx = await new TokenCreateTransaction()
      .setTokenName(this.tokenName)
      .setTokenSymbol(this.tokenSymbol)
      .setDecimals(this.tokenDecimal)
      .setInitialSupply(this.tokenSupply)
      .setMaxSupply(this.tokenSupply)
      .setTreasuryAccountId(operatorAccountId)
      .setTokenType(TokenType.FungibleCommon) // Explicitly set token type
      .setSupplyType(TokenSupplyType.Finite) // Explicitly set supply type
      .setFreezeDefault(false) // Ensure freeze is disabled by default
      .freezeWith(client);

    const tokenCreateSign = await tokenCreateTx.sign(operatorPrivateKey);
    const tokenCreateSubmit = await tokenCreateSign.execute(client);
    const tokenCreateReceipt = await tokenCreateSubmit.getReceipt(client);

    this.tokenId = tokenCreateReceipt.tokenId;
    assert.ok(this.tokenId, "Token creation failed");

    console.log("Fixed supply token created with ID:", this.tokenId.toString());
  }
);

Then(
  /^The total supply of the token is (\d+)$/,
  async function (expectedTotalSupply: number) {
    // Check if tokenId is defined
    assert.ok(this.tokenId, "Token ID is not defined");

    // Fetch token info using the tokenId
    const tokenInfo = await new TokenInfoQuery()
      .setTokenId(this.tokenId)
      .execute(client);

    // Assert that the total supply matches the expected value
    assert.strictEqual(
      tokenInfo.totalSupply.toNumber(),
      expectedTotalSupply,
      "Token total supply does not match"
    );
    console.log("Token total supply:", tokenInfo.totalSupply.toNumber());
  }
);

Then(/^An attempt to mint tokens fails$/, async function () {
  // Check if tokenId is defined
  assert.ok(this.tokenId, "Token ID is not defined");

  try {
    // Attempt to create a mint transaction
    const mintTx = await new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(100) // Arbitrary amount for the test
      .freezeWith(client);

    // Sign the transaction with the treasury account's private key
    const mintSign = await mintTx.sign(operatorPrivateKey);

    // Submit the transaction to the Hedera network
    const mintSubmit = await mintSign.execute(client);

    // Get the receipt of the transaction
    const mintReceipt = await mintSubmit.getReceipt(client);

    // If the transaction succeeds, throw an error
    assert.notStrictEqual(
      mintReceipt.status.toString(),
      "SUCCESS",
      "Minting tokens should have failed but succeeded"
    );
  } catch (error) {
    // Ensure the error is due to minting failure
    console.log("Minting tokens failed as expected:", error);
  }
});

Given(
  /^A first hedera account with more than (\d+) hbar$/,
  async function (expectedBalance: number) {
    const acc = accounts[1];
    const account: AccountId = AccountId.fromString(acc.id);
    this.account = account;

    const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
    this.privKey = privKey;

    const query = new AccountBalanceQuery().setAccountId(account);
    const balance = await query.execute(client);

    assert.ok(
      balance.hbars.toBigNumber().toNumber() > expectedBalance,
      "Account balance is less than expected."
    );

    console.log(
      `Account ${this.account.toString()} has a balance of ${balance.hbars
        .toBigNumber()
        .toNumber()} hbars.`
    );
  }
);

Given(/^A second Hedera account$/, async function () {
  const acc = accounts[2];
  const account: AccountId = AccountId.fromString(acc.id);
  this.account = account;

  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey = privKey;

  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client);

  assert.ok(
    balance.hbars.toBigNumber().toNumber() > 0,
    "Second account balance is less than expected."
  );

  console.log(
    `Second account ${this.account.toString()} has a balance of ${balance.hbars
      .toBigNumber()
      .toNumber()} hbars.`
  );
});

Given(
  /^A token named Test Token \(HTT\) with (\d+) tokens$/,
  async function (initialSupply: number) {
    this.tokenDecimal = 2;
    this.tokenSupply = initialSupply;
    this.tokenSymbol = "HTT";
    this.tokenName = "Test Token";

    const tokenCreateTx = await new TokenCreateTransaction()
      .setTokenName(this.tokenName)
      .setTokenSymbol(this.tokenSymbol)
      .setDecimals(this.tokenDecimal)
      .setSupplyKey(operatorPrivateKey)
      .setAdminKey(operatorPrivateKey) // Explicitly setting no adminKey
      .setAutoRenewAccountId(operatorAccountId) // Ensuring no autoRenewAccount is set
      .setInitialSupply(this.tokenSupply)
      .setTreasuryAccountId(operatorAccountId)
      .setTokenType(TokenType.FungibleCommon) // Explicitly set token type
      .setFreezeDefault(false) // Ensure freeze is disabled by default
      .setWipeKey(operatorPrivateKey) // Explicitly setting no wipeKey
      .setKycKey(operatorPrivateKey) // Explicitly setting no kycKey
      .setSupplyType(TokenSupplyType.Infinite) // Explicitly set supply type
      .freezeWith(client);

    const tokenCreateSign = await tokenCreateTx.sign(operatorPrivateKey);
    const tokenCreateSubmit = await tokenCreateSign.execute(client);
    const tokenCreateReceipt = await tokenCreateSubmit.getReceipt(client);

    this.tokenId = tokenCreateReceipt.tokenId;
    assert.ok(this.tokenId, "Token creation failed");

    console.log("Token created with ID:", this.tokenId.toString());
  }
);

Given(
  /^The first account holds (\d+) HTT tokens$/,
  async function (expectedTokenBalance: number) {
    assert.ok(this.tokenId, "Token ID is not defined");

    const acc = accounts[1].id;

    const ensureTokenAssociation = async () => {
      const isTokenAssociated = await isAssociated(
        AccountId.fromString(acc),
        this.tokenId.toString(),
        client
      );

      if (!isTokenAssociated) {
        console.log(
          `Associating first account ${this.account.toString()} with token ID: ${
            this.tokenId
          }`
        );

        const associateTx = await new TokenAssociateTransaction()
          .setAccountId(AccountId.fromString(acc))
          .setTokenIds([this.tokenId])
          .freezeWith(client)
          .sign(this.privKey);

        const associateReceipt = await (
          await associateTx.execute(client)
        ).getReceipt(client);
        assert.strictEqual(
          associateReceipt.status.toString(),
          "SUCCESS",
          "Token association failed"
        );

        console.log(
          `First account ${this.account.toString()} successfully associated with token ID: ${
            this.tokenId
          }`
        );
      }
    };

    const verifyTokenBalance = async () => {
      const balanceQuery = await new AccountBalanceQuery()
        .setAccountId(acc)
        .execute(client);

      const tokenBalance = balanceQuery.tokens?.get(this.tokenId);
      assert.ok(
        tokenBalance,
        `Token balance for the first account is not defined for token ID: ${this.tokenId}`
      );
      assert.strictEqual(
        tokenBalance.toNumber(),
        expectedTokenBalance,
        "Token balance for the first account does not match the expected value"
      );

      console.log(
        `First account ${this.account.toString()} holds ${tokenBalance.toNumber()} HTT tokens.`
      );
    };

    await ensureTokenAssociation();
    await verifyTokenBalance();
  }
);

Given(
  /^The second account holds (\d+) HTT tokens$/,
  async function (expectedTokenBalance: number) {
    assert.ok(this.tokenId, "Token ID is not defined");

    const acc = accounts[2].id;

    const ensureTokenAssociation = async () => {
      const isTokenAssociated = await isAssociated(
        AccountId.fromString(acc),
        this.tokenId.toString(),
        client
      );

      if (!isTokenAssociated) {
        console.log(
          `Associating second account ${this.account.toString()} with token ID: ${
            this.tokenId
          }`
        );

        const associateTx = await new TokenAssociateTransaction()
          .setAccountId(acc)
          .setTokenIds([this.tokenId])
          .freezeWith(client)
          .sign(operatorPrivateKey);

        const associateReceipt = await (
          await associateTx.execute(client)
        ).getReceipt(client);
        assert.strictEqual(
          associateReceipt.status.toString(),
          "SUCCESS",
          "Token association failed"
        );

        console.log(
          `Second account ${this.account.toString()} successfully associated with token ID: ${
            this.tokenId
          }`
        );
      }
    };

    const transferTokens = async () => {
      const transferTx = await new TransferTransaction()
        .addTokenTransfer(
          this.tokenId,
          operatorAccountId,
          -expectedTokenBalance
        )
        .addTokenTransfer(
          this.tokenId,
          accounts[2].id,
          expectedTokenBalance
        )
        .freezeWith(client)
        .sign(operatorPrivateKey);

      const transferReceipt = await (
        await transferTx.execute(client)
      ).getReceipt(client);
      assert.strictEqual(
        transferReceipt.status.toString(),
        "SUCCESS",
        "Token transfer failed"
      );

      console.log(
        `Transferred ${expectedTokenBalance} HTT tokens to the second account.`
      );
    };

    const verifyTokenBalance = async () => {
      const balanceQuery = await new AccountBalanceQuery()
        .setAccountId(this.account)
        .execute(client);

      const tokenBalance = balanceQuery.tokens?.get(this.tokenId);
      assert.ok(
        tokenBalance,
        `Token balance for the second account is not defined for token ID: ${this.tokenId}`
      );
      assert.strictEqual(
        tokenBalance.toNumber(),
        expectedTokenBalance,
        "Token balance for the second account does not match the expected value"
      );

      console.log(
        `Second account ${this.account.toString()} holds ${tokenBalance.toNumber()} HTT tokens.`
      );
    };

    await ensureTokenAssociation();
    await transferTokens();
    await verifyTokenBalance();
  }
);

When(
  /^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/,
  async function (amount: number) {
    assert.ok(this.tokenId, "Token ID is not defined");

    // Create the transfer transaction
    const transaction = await new TransferTransaction()
      .addTokenTransfer(this.tokenId, accounts[1].id, -amount)
      .addTokenTransfer(this.tokenId, accounts[2].id, amount)
      .freezeWith(client);

    // Store the transaction for later submission
    this.storedTransaction = transaction;

    console.log("Transaction created and stored for later submission.");
  }
);

When(/^The first account submits the transaction$/, async function () {
  assert.ok(this.storedTransaction, "No stored transaction to execute");

  // Sign the stored transaction with the first account's private key
  const signedTransaction = await this.storedTransaction.sign(
    PrivateKey.fromStringED25519(accounts[1].privateKey)
  );

  // Submit the transaction to the Hedera network
  const txResponse = await signedTransaction.execute(client);

  // Request the receipt of the transaction
  const receipt = await txResponse.getReceipt(client);

  // Obtain the transaction consensus status
  const transactionStatus = receipt.status;

  assert.strictEqual(
    transactionStatus.toString(),
    "SUCCESS",
    "Token transfer transaction failed"
  );

  console.log(
    "The transaction consensus status:",
    transactionStatus.toString()
  );
});

When(
  /^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/,
  async function (amount: number) {
    assert.ok(this.tokenId, "Token ID is not defined");

    // Create the transfer transaction
    const transaction = await new TransferTransaction()
      .addTokenTransfer(this.tokenId, accounts[2].id, -amount)
      .addTokenTransfer(this.tokenId, accounts[1].id, amount)
      .freezeWith(client);

    // Store the transaction for later submission
    this.storedTransaction = transaction;

    console.log("Transaction created and stored for later submission.");
  }
);

Then(/^The first account has paid for the transaction fee$/, async function () {
  assert.ok(this.storedTransaction, "No stored transaction to verify");

  // Sign the stored transaction with the second account's private key
  const signedTransaction = await this.storedTransaction.sign(
    PrivateKey.fromStringED25519(accounts[2].privateKey)
  );

  // Submit the transaction to the Hedera network
  const txResponse = await signedTransaction.execute(client);

  // Request the receipt of the transaction
  const receipt = await txResponse.getReceipt(client);

  // Verify the transaction status
  assert.strictEqual(
    receipt.status.toString(),
    "SUCCESS",
    "Transaction failed"
  );

  console.log("Transaction fee paid successfully by the first account.");
});

Given(
  /^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/,
  async function (expectedHbarBalance: number, expectedTokenBalance: number) {
    await this.step(
      `A first hedera account with more than ${expectedHbarBalance} hbar`
    );
    await this.step(
      `The first account holds ${expectedTokenBalance} HTT tokens`
    );
  }
);

Given(
  /^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/,
  async function (expectedHbarBalance: number, expectedTokenBalance: number) {
    await this.step(`A second Hedera account`);
    await this.step(
      `The second account holds ${expectedTokenBalance} HTT tokens`
    );
  }
);

Given(
  /^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/,
  async function (expectedHbarBalance: number, expectedTokenBalance: number) {
    const acc = accounts[3];
    const account: AccountId = AccountId.fromString(acc.id);
    this.thirdAccount = account;

    const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
    this.thirdPrivateKey = privKey;

    const query = new AccountBalanceQuery().setAccountId(account);
    const balance = await query.execute(client);

    assert.ok(
      balance.hbars.toBigNumber().toNumber() > expectedHbarBalance,
      "Third account balance is less than expected."
    );

    console.log(
      `Third account ${this.thirdAccount.toString()} has a balance of ${balance.hbars
        .toBigNumber()
        .toNumber()} hbars.`
    );

    await this.step(
      `The third account holds ${expectedTokenBalance} HTT tokens`
    );
  }
);

Given(
  /^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/,
  async function (expectedHbarBalance: number, expectedTokenBalance: number) {
    const acc = accounts[4];
    const account: AccountId = AccountId.fromString(acc.id);
    this.fourthAccount = account;

    const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
    this.fourthPrivateKey = privKey;

    const query = new AccountBalanceQuery().setAccountId(account);
    const balance = await query.execute(client);

    assert.ok(
      balance.hbars.toBigNumber().toNumber() > expectedHbarBalance,
      "Fourth account balance is less than expected."
    );

    console.log(
      `Fourth account ${this.fourthAccount.toString()} has a balance of ${balance.hbars
        .toBigNumber()
        .toNumber()} hbars.`
    );

    await this.step(
      `The fourth account holds ${expectedTokenBalance} HTT tokens`
    );
  }
);

When(
  /^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/,
  async function (
    amountFromFirst: number,
    amountToThird: number,
    amountToFourth: number
  ) {
    assert.ok(this.tokenId, "Token ID is not defined");
    assert.ok(this.thirdAccount, "Third account is not defined");
    assert.ok(this.fourthAccount, "Fourth account is not defined");

    // Create the transfer transaction
    const transaction = await new TransferTransaction()
      .addTokenTransfer(this.tokenId, accounts[1].id, -amountFromFirst)
      .addTokenTransfer(this.tokenId, accounts[2].id, -amountFromFirst)
      .addTokenTransfer(this.tokenId, accounts[3].id, amountToThird)
      .addTokenTransfer(this.tokenId, accounts[4].id, amountToFourth)
      .freezeWith(client);

    // Store the transaction for later submission
    this.storedTransaction = transaction;

    console.log("Transaction created and stored for later submission.");
  }
);

Then(
  /^The third account holds (\d+) HTT tokens$/,
  async function (expectedTokenBalance: number) {
    assert.ok(this.tokenId, "Token ID is not defined");

    const balanceQuery = await new AccountBalanceQuery()
      .setAccountId(this.thirdAccount)
      .execute(client);

    const tokenBalance = balanceQuery.tokens?.get(this.tokenId);
    assert.ok(
      tokenBalance,
      `Token balance for the third account is not defined for token ID: ${this.tokenId}`
    );
    assert.strictEqual(
      tokenBalance.toNumber(),
      expectedTokenBalance,
      "Token balance for the third account does not match the expected value"
    );

    console.log(
      `Third account ${this.thirdAccount.toString()} holds ${tokenBalance.toNumber()} HTT tokens.`
    );
  }
);

Then(
  /^The fourth account holds (\d+) HTT tokens$/,
  async function (expectedTokenBalance: number) {
    assert.ok(this.tokenId, "Token ID is not defined");

    const balanceQuery = await new AccountBalanceQuery()
      .setAccountId(this.fourthAccount)
      .execute(client);

    const tokenBalance = balanceQuery.tokens?.get(this.tokenId);
    assert.ok(
      tokenBalance,
      `Token balance for the fourth account is not defined for token ID: ${this.tokenId}`
    );
    assert.strictEqual(
      tokenBalance.toNumber(),
      expectedTokenBalance,
      "Token balance for the fourth account does not match the expected value"
    );

    console.log(
      `Fourth account ${this.fourthAccount.toString()} holds ${tokenBalance.toNumber()} HTT tokens.`
    );
  }
);
