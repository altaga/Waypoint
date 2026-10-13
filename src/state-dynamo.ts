import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { emptyState, StateConflictError, type StateStore, type UserState } from "./state.ts";

// DynamoDB implementation of StateStore for Lambda. One item per user: partition key "userId",
// the whole UserState stored as JSON in "state", and a "version" number. A save is a conditional
// write: it only lands when the stored version is the one the state was loaded with, so two
// requests cannot overwrite each other. A lost race throws StateConflictError and the caller retries.
export function createDynamoStore(tableName: string, client?: DynamoDBDocumentClient): StateStore {
  const doc = client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  return {
    async load(userId) {
      const res = await doc.send(new GetCommand({ TableName: tableName, Key: { userId } }));
      const raw = res.Item?.state as string | undefined;
      const version = Number(res.Item?.version ?? 0);
      return raw ? { ...(JSON.parse(raw) as UserState), version } : { ...emptyState(), version };
    },
    async save(userId, state) {
      const expected = state.version ?? 0;
      const { version: _loadedVersion, ...body } = state;
      try {
        await doc.send(new PutCommand({
          TableName: tableName,
          Item: { userId, state: JSON.stringify(body), version: expected + 1, updatedAt: new Date().toISOString() },
          // A first write needs the version attribute to be absent; later writes need it to match.
          ConditionExpression: expected === 0 ? "attribute_not_exists(#v)" : "#v = :expected",
          ExpressionAttributeNames: { "#v": "version" },
          ...(expected === 0 ? {} : { ExpressionAttributeValues: { ":expected": expected } }),
        }));
      } catch (err) {
        if ((err as { name?: string }).name === "ConditionalCheckFailedException") throw new StateConflictError();
        throw err;
      }
      state.version = expected + 1;
    },
    async remove(userId) {
      await doc.send(new DeleteCommand({ TableName: tableName, Key: { userId } }));
    },
  };
}
