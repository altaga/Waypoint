import { test, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { WaypointStack } from "../infra/waypoint-stack.ts";

// The stack needs the Lambda bundle as an asset, so build it first if it is missing.
const ROOT = join(import.meta.dirname, "..");
before(() => {
  if (!existsSync(join(ROOT, "lambda-bundle", "index.mjs"))) {
    const r = spawnSync("npx", ["tsx", "scripts/build-lambda.ts"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
    assert.equal(r.status, 0, "could not build lambda-bundle");
  }
});

const template = () => Template.fromStack(new WaypointStack(new App(), "waypoint-stack"));

test("the table and the function are named with the waypoint_ prefix", () => {
  const t = template();
  t.hasResourceProperties("AWS::DynamoDB::Table", { TableName: "waypoint_state", BillingMode: "PAY_PER_REQUEST" });
  t.hasResourceProperties("AWS::Lambda::Function", { FunctionName: "waypoint_server", Handler: "index.handler", Runtime: "nodejs22.x" });
});

test("every named resource starts with waypoint_", () => {
  const names: string[] = [];
  // Role names are visible in IAM, so they are checked too.
  for (const r of Object.values(template().toJSON().Resources as Record<string, { Properties?: Record<string, unknown> }>)) {
    for (const key of ["TableName", "FunctionName", "RoleName"]) {
      const v = r.Properties?.[key];
      if (typeof v === "string") names.push(v);
    }
  }
  assert.ok(names.length >= 3);
  for (const n of names) assert.match(n, /^waypoint_/);
});

test("the public function URL has no IAM auth (Alexa and agents must reach it), and the table keeps its data on delete", () => {
  const t = template();
  t.hasResourceProperties("AWS::Lambda::Url", { AuthType: "NONE" });
  t.hasResource("AWS::DynamoDB::Table", { DeletionPolicy: "Retain" });
});

test("Bedrock permissions are limited to model invocation actions", () => {
  const policies = JSON.stringify(template().findResources("AWS::IAM::Policy"));
  assert.match(policies, /bedrock:InvokeModel/);
  assert.doesNotMatch(policies, /"bedrock:\*"/);
});
