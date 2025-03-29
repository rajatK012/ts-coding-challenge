import { accounts } from "./config";
import { AccountCreateTransaction, AccountId, Client, PrivateKey } from "@hashgraph/sdk";
import * as dotenv from "dotenv";
import * as fs from "fs";


// Pre-configured client for test network (testnet)
dotenv.config();

const client = Client.forTestnet();
client.setOperator(
  process.env.MY_ACCOUNT_ID as string,
  PrivateKey.fromString(process.env.MY_PRIVATE_KEY as string)
);


async function main() {
  // const account = accounts[0];
  const MY_ACCOUNT_ID = AccountId.fromString(process.env.MY_ACCOUNT_ID as string);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(process.env.MY_PRIVATE_KEY as string);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  const newAccounts: { id: string; privateKey: string }[] = [];

  for (let i = 0; i < 5; i++) {
    const newPrivateKey = PrivateKey.generate();
    const receipt = await (
      await new AccountCreateTransaction()
        .setInitialBalance(100)
        .setKey(newPrivateKey)
        .execute(client)
    ).getReceipt(client);

    newAccounts.push({
      id: receipt.accountId?.toString() || "unknown",
      privateKey: newPrivateKey.toString(),
    });
  }

  fs.writeFileSync("newAccounts.json", JSON.stringify(newAccounts, null, 2));
  console.log("Accounts written to newAccounts.json");
}

main().then(console.log).catch(console.error);
