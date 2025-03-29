import { Given, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageQuery,
  TopicMessageSubmitTransaction,
  KeyList,
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";
import * as dotenv from "dotenv";

// Pre-configured client for test network (testnet)
dotenv.config();

const client = Client.forTestnet();

// Set the operator with the account ID and private key
Given(
  /^a first account with more than (\d+) hbars$/,
  async function (expectedBalance: number) {
    const acc = accounts[0];
    const account: AccountId = AccountId.fromString(acc.id);
    this.account = account;

    const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
    this.privKey = privKey;

    client.setOperator(this.account, privKey);

    const query = new AccountBalanceQuery().setAccountId(account);
    const balance = await query.execute(client);

    assert.ok(
      balance.hbars.toBigNumber().toNumber() > expectedBalance,
      "Account balance is less than expected."
    );
  }
);

When(
  /^A topic is created with the memo "([^"]*)" with the first account as the submit key$/,
  async function (memo: string) {
    const transaction = await new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setSubmitKey(this.privKey)
      .setAdminKey(this.privKey) // Explicitly setting no adminKey
      .setAutoRenewAccountId(this.account) // Ensuring no autoRenewAccount is set
      .execute(client);

    const receipt = await transaction.getReceipt(client);
    this.topicId = receipt.topicId?.toString();

    console.log("Created topic with ID:", this.topicId); // Log the topic ID for debugging

    assert.ok(this.topicId, "Failed to create topic");
  }
);

When(
  /^The message "([^"]*)" is published to the topic$/,
  async function (message: string) {
    assert.ok(this.topicId, "Topic ID is not set");

    const transaction = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(message)
      .execute(client);

    const receipt = await transaction.getReceipt(client);
    assert.strictEqual(
      receipt.status.toString(),
      "SUCCESS",
      "Failed to publish message"
    );
  }
);

Then(
  /^The message "([^"]*)" is received by the topic and can be printed to the console$/,
  { timeout: 15_000 },
  async function (expectedMessage: string) {
    assert.ok(this.topicId, "Topic ID is not set");

    await new Promise<void>((resolve, reject) => {
      const subscription = new TopicMessageQuery()
        .setTopicId(this.topicId)
        .setStartTime(0)
        .subscribe(
          client,
          (error) => {
            subscription.unsubscribe();
            reject(error);
          },
          (message) => {
            if (!message) {
              return;
            }
            const receivedMessage = Buffer.from(message.contents).toString(
              "utf8"
            );
            this.receivedMessages = this.receivedMessages || [];
            this.receivedMessages.push(receivedMessage);

            if (receivedMessage === expectedMessage) {
              subscription.unsubscribe();
              resolve();
            }
          }
        );
    });

    assert.ok(
      this.receivedMessages && this.receivedMessages.length > 0 && this.receivedMessages.includes(expectedMessage),
      "No messages were received"
    );
  }
);

Given(
  /^A second account with more than (\d+) hbars$/,
  async function (expectedBalance: number) {
    const acc = accounts[1];
    const account: AccountId = AccountId.fromString(acc.id);
    this.secondAccount = account;
    const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
    this.secondPrivKey = privKey;

    const query = new AccountBalanceQuery().setAccountId(account);
    const balance = await query.execute(client);
    assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
  }
);

Given(
  /^A (\d+) of (\d+) threshold key with the first and second account$/,
  async function (threshold: number, totalKeys: number) {
    const keyList = KeyList.of(this.privKey, this.secondPrivKey).setThreshold(
      threshold
    );
    this.thresholdKey = keyList;
    assert.strictEqual(
      keyList._keys.length,
      totalKeys,
      "Threshold key setup failed"
    );
  }
);

When(
  /^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/,
  async function (memo: string) {
    assert.ok(this.thresholdKey, "Threshold key is not set");
    assert.ok(this.account, "Auto-renew account is not set");

    const transaction = await new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setSubmitKey(this.thresholdKey)
      .setAdminKey(this.privKey) // Explicitly setting no adminKey
      .setAutoRenewAccountId(this.account)// Ensure correct type
      .execute(client);

    const receipt = await transaction.getReceipt(client);
    this.topicId = receipt.topicId?.toString();

    assert.ok(this.topicId, "Topic ID is not set");
  }
);
