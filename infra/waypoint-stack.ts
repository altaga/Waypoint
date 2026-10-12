import { Duration, RemovalPolicy, Stack, type StackProps, CfnOutput, aws_dynamodb as ddb, aws_lambda as lambda, aws_logs as logs, aws_iam as iam } from "aws-cdk-lib";
import type { Construct } from "constructs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Optional settings, passed with: cdk deploy -c alexaSkillId=... -c bedrockModel=...
// Nothing here creates anything until someone runs `cdk deploy`.
export class WaypointStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new ddb.Table(this, "StateTable", {
      tableName: "waypoint_state",
      partitionKey: { name: "userId", type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const brainModel = this.node.tryGetContext("bedrockModel") as string | undefined;
    const skillId = this.node.tryGetContext("alexaSkillId") as string | undefined;

    const fn = new lambda.Function(this, "Server", {
      functionName: "waypoint_server",
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(join(dirname(fileURLToPath(import.meta.url)), "..", "lambda-bundle")),
      memorySize: 512,
      // Alexa stops waiting after about 8 seconds; the Bedrock brain can take a few.
      timeout: Duration.seconds(20),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        WAYPOINT_TABLE_NAME: table.tableName,
        WAYPOINT_OFFLINE: "0",
        WAYPOINT_BRAIN: brainModel ? "bedrock" : "",
        WAYPOINT_BEDROCK_MODEL: brainModel ?? "",
        ALEXA_SKILL_ID: skillId ?? "",
      },
    });
    table.grantReadWriteData(fn);
    // Bedrock access for the brain: text models only, invoked by this function's role.
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:Converse", "bedrock:ConverseStream"],
      resources: ["arn:aws:bedrock:*::foundation-model/*", `arn:aws:bedrock:*:${this.account}:inference-profile/*`],
    }));

    // Public HTTPS address. /mcp serves agents, /alexa serves the Alexa skill (signature checked in code).
    const url = fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });

    new CfnOutput(this, "WaypointPublicUrl", { value: url.url, exportName: "waypoint-public-url" });
    new CfnOutput(this, "WaypointStateTable", { value: table.tableName });
  }
}
