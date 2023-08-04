import {
  Duration,
  Stack,
  StackProps,
  aws_lambda_nodejs as lambda_nodejs,
  aws_lambda as lambda,
  aws_lambda_event_sources as event_sources,
  TimeZone,
  aws_iam as iam,
  aws_sqs as sqs,
  aws_dynamodb as dynamodb,
  RemovalPolicy,
} from "aws-cdk-lib";
import { Group } from "@aws-cdk/aws-scheduler-alpha";
import { Construct } from "constructs";
import * as path from "path";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

/**
 * These areas come from the {@link https://eskom-calendar-api.shuttleapp.rs/#/latest/list_all_areas} API
 * for now I will be using a few. in the future we can fetch them dynamically on deployment and do a regular deloyment to update the list
 */
const SUPPORTED_AREAS = [
  "city-of-cape-town-area-1",
  "city-of-cape-town-area-2",
  // "city-of-cape-town-area-3",
  // "city-of-cape-town-area-4",
  // "city-of-cape-town-area-5",
  // "city-of-cape-town-area-6",
  // "city-of-cape-town-area-7",
  // "city-of-cape-town-area-8",
  // "city-of-cape-town-area-9",
  // "city-of-cape-town-area-10",
  // "city-of-cape-town-area-11",
  // "city-of-cape-town-area-12",
  // "city-of-cape-town-area-13",
  // "city-of-cape-town-area-14",
  // "city-of-cape-town-area-15",
  // "city-of-cape-town-area-16",
];

export class LoadsheddingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const subsribersTable = new dynamodb.Table(this, "SubscribersTable", {
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    const AreaNameIndexName = "AreaNameIndex";
    const EmailIndexName = "EmailIndex";

    subsribersTable.addGlobalSecondaryIndex({
      indexName: AreaNameIndexName,
      partitionKey: {
        name: "area_name",
        type: dynamodb.AttributeType.STRING,
      },

      projectionType: dynamodb.ProjectionType.ALL,
    });

    subsribersTable.addGlobalSecondaryIndex({
      indexName: EmailIndexName,
      partitionKey: {
        name: "email",
        type: dynamodb.AttributeType.STRING,
      },

      projectionType: dynamodb.ProjectionType.ALL,
    });

    const logsTable = new dynamodb.Table(this, "LogsTable", {
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "timestamp",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    const WebhookIndex = "WebhookIndex";

    logsTable.addGlobalSecondaryIndex({
      indexName: WebhookIndex,
      partitionKey: {
        name: "webhookUrl",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "timestamp",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const sqsQueue = new sqs.Queue(this, "ScheduleQueue", {
      visibilityTimeout: Duration.seconds(30),
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const scheduleGroups = SUPPORTED_AREAS.map((area) => {
      return new Group(this, `LoadSheddingGroup-${area}`, {
        groupName: area,
      });
    });

    // Define the IAM role for the EventBridge Scheduler
    const schedulerRole = new iam.Role(this, "SchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });

    // Define the IAM policy for the Scheduler to send messages to the SQS queue
    const sendMessageToSQSPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["sqs:SendMessage"],
      resources: [sqsQueue.queueArn],
    });

    // Attach the policy to the role
    schedulerRole.addToPolicy(sendMessageToSQSPolicy);

    // Create the IAM role for the  process schedule lambda function
    const scheduleLambdaRole = new iam.Role(this, "ScheduleLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    // Create the IAM role for the  process schedule lambda function
    const processScheduleLambdaRole = new iam.Role(
      this,
      "ProcessScheduleLambdaRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      }
    );

    // Add the required policies to the Lambda role
    processScheduleLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    );
    // Add the required policies to the Lambda role
    scheduleLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    );
    scheduleLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["scheduler:CreateSchedule"],
        resources: ["*"], // TODO: Replace '*' with the specific resource ARN
      })
    );
    processScheduleLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["scheduler:DeleteSchedule", "scheduler:ListSchedules"],
        resources: ["*"], // TODO: Replace '*' with the specific resource ARN
      })
    );

    // Allow iam:PassRole for the execution role to be used by EventBridge
    scheduleLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: ["*"], // Replace with the ARN of your EventBridge execution role
      })
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
          targetRoleArn: schedulerRole.roleArn,
          targetArn: sqsQueue.queueArn,
          timezone: TimeZone.AFRICA_MAPUTO.timezoneName,
          scheduleGroups: JSON.stringify(
            scheduleGroups.map((g) => g.groupName)
          ),
        },
        role: scheduleLambdaRole,
        logRetention: RetentionDays.ONE_WEEK,
      }
    );

    //Lambda is triggered with the schedule arrives and deletes the schedule from the table
    const processScheduleLambda = new lambda_nodejs.NodejsFunction(
      this,
      "ProcessScheduleLambda",
      {
        runtime: lambda.Runtime.NODEJS_16_X,
        memorySize: 1024,
        timeout: Duration.seconds(30),
        handler: "handler",
        entry: path.join(__dirname, "/../lambda/processSchedule/index.ts"),
        environment: {
          timezone: TimeZone.AFRICA_MAPUTO.timezoneName,
          schedulerLambdaName: schedulerLambda.functionArn,
          subsribersTableName: subsribersTable.tableName,
          logsTableName: logsTable.tableName,
          AreaNameIndexName,
        },
        logRetention: RetentionDays.ONE_WEEK,
        role: processScheduleLambdaRole,
        retryAttempts: 0,
      }
    );

    processScheduleLambda.addEventSource(
      new event_sources.SqsEventSource(sqsQueue, {
        batchSize: 1,
      })
    );

    subsribersTable.grantReadData(processScheduleLambda);
    logsTable.grantReadWriteData(processScheduleLambda);

    schedulerLambda.grantInvoke(processScheduleLambda);
  }
}
