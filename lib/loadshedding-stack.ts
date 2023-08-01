import {
  Duration,
  Stack,
  StackProps,
  aws_lambda_nodejs as lambda_nodejs,
  aws_lambda as lambda,
  aws_dynamodb as dynamodb,
  aws_lambda_event_sources as event_sources,
  RemovalPolicy,
} from "aws-cdk-lib";
import { Group } from "@aws-cdk/aws-scheduler-alpha";
import { Construct } from "constructs";
import * as path from "path";

export class LoadsheddingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //Holds schedules. when a schedule pass, the schedule is deleted from the table
    const table = new dynamodb.Table(this, id, {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // 👇 add global secondary index
    table.addGlobalSecondaryIndex({
      indexName: "areaNameIndex",
      partitionKey: { name: "area_name", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "start_time", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    //Event scheduler group
    const group = new Group(this, "LoadsheddingScheduleEventGroup", {
      groupName: "Event",
    });

    //Lambda is triggered with the schedule arrives and deletes the schedule from the table
    const executeLambda = new lambda_nodejs.NodejsFunction(
      this,
      "ExecuteLambda",
      {
        runtime: lambda.Runtime.NODEJS_16_X,
        memorySize: 1024,
        timeout: Duration.seconds(5),
        handler: "handler",
        entry: path.join(__dirname, "/../lambda/execute/index.ts"),
        environment: {
          tableName: table.tableName,
          eventGroupName: group.groupName,
        },
      }
    );

    // Lambda function that listens to deletion events in the dynamo db table
    // when the table is empty, it fetches the schedules from an API and populates the table
    // It also creates event schedules with the even scheduler service.
    const schedulerLambda = new lambda_nodejs.NodejsFunction(
      this,
      "ScheduleLambda",
      {
        runtime: lambda.Runtime.NODEJS_16_X,
        memorySize: 1024,
        timeout: Duration.seconds(5),
        handler: "handler",
        entry: path.join(__dirname, "/../lambda/schedule/index.ts"),
        environment: {
          tableName: table.tableName,
          executeLambdaArn: executeLambda.functionArn,
          eventGroupName: group.groupName,
        },
      }
    );

    schedulerLambda.addEventSource(
      new event_sources.DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.LATEST,
      })
    );

    table.grantFullAccess(schedulerLambda);
    table.grantFullAccess(executeLambda);

    group.grantReadSchedules(schedulerLambda);
    group.grantWriteSchedules(schedulerLambda);

    group.grantReadSchedules(executeLambda);
    group.grantWriteSchedules(executeLambda);
  }
}
