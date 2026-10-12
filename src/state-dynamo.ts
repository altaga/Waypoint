import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { emptyState, type StateStore, type UserState } from "./state.ts";

// DynamoDB implementation of StateStore for Lambda. One item per user:
// partition key "userId", the whole UserState stored as JSON in "state".
export function createDynamoStore(tableName: string, client?: DynamoDBDocumentClient): StateStore {
  const doc = client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  return {
    async load(userId) {
      const res = await doc.send(new GetCommand({ TableName: tableName, Key: { userId } }));
      const raw = res.Item?.state as string | undefined;
      return raw ? (JSON.parse(raw) as UserState) : emptyState();
    },
    async save(userId, state) {
      await doc.send(new PutCommand({ TableName: tableName, Item: { userId, state: JSON.stringify(state), updatedAt: new Date().toISOString() } }));
    },
    async remove(userId) {
      await doc.send(new DeleteCommand({ TableName: tableName, Key: { userId } }));
    },
  };
}
