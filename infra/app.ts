import { App } from "aws-cdk-lib";
import { WaypointStack } from "./waypoint-stack.ts";

// Every resource name starts with "waypoint_" so it is easy to find in the console.
// (The CloudFormation stack id itself cannot contain underscores, so it is "waypoint-stack".)
const app = new App();
new WaypointStack(app, "waypoint-stack", {
  description: "Waypoint: MCP server, Alexa skill endpoint and state table",
});
app.synth();
