import {
  ListSchedulesCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import { SQSEvent } from "aws-lambda";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

import { Schedule, Subscriber } from "../shared/types";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { postToWebhook } from "./util";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const config = { region: process.env.AWS_REGION };
const schedulerClient = new SchedulerClient(config);
const lambadClient = new LambdaClient(config);
const dynamodbClient = new DynamoDBClient(config);

export const handler = async (event: SQSEvent) => {
  const scheduleData: Schedule[] = event.Records.map((message) =>
    JSON.parse(message.body)
  );

  console.log("Schedule Data", scheduleData);

  console.log("Invoking webhooks....");

  const results = await Promise.all(
    scheduleData.map(async (event) => {
      const getSubscribersCommand = new QueryCommand({
        TableName: process.env.subsribersTableName,
        IndexName: process.env.AreaNameIndexName,
        KeyConditionExpression: "#area_name = :area_name",
        ExpressionAttributeNames: {
          "#area_name": "area_name",
        },
        ExpressionAttributeValues: {
          ":area_name": { S: event.area_name },
        },
      });

      const response = await dynamodbClient.send(getSubscribersCommand);
      const subscribers = response.Items?.map((item) =>
        unmarshall(item)
      ) as unknown[] as Subscriber[];

      console.log(`Posting to ${subscribers.length} subscribers`);

      // send post requests to subscribers' webhooks
      return postToWebhook(subscribers, event);
    })
  );

  console.log("Webhook execution results: ", results);

  // Check if the group schedule is empty, if so, trigger the schedule lambda with  the [area_name] in the payload
  const command = new ListSchedulesCommand({
    GroupName: scheduleData[0].area_name,
  });

  const response = await schedulerClient.send(command);

  if (response.Schedules && response.Schedules?.length === 0)
    return console.log("Upcoming Events:", response.Schedules.length);

  const invokeLambdaCommand = new InvokeCommand({
    FunctionName: process.env.schedulerLambdaName,
    InvocationType: "Event",
    Payload: JSON.stringify({ areas: scheduleData.map((s) => s.area_name) }),
  });

  lambadClient.send(invokeLambdaCommand);

  return {
    body: JSON.stringify({ message: "SUCCESS 🎉" }),
    statusCode: 200,
  };
};
