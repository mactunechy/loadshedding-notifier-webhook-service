import axios from "axios";
import { Schedule, Subscriber } from "../shared/types";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { v4 as uuid } from "uuid";

const config = { region: process.env.AWS_REGION };
const dynamodbClient = new DynamoDBClient(config);

export const postToWebhook = async (
  subscribers: Subscriber[],
  schedule: Schedule
) => {
  const results = { failed: 0, success: 0 };

  for (let subscriber of subscribers) {
    try {
      const headers = {
        "Content-Type": "application/json",
      };

      const response = await axios.post(subscriber.webhookUrl, schedule, {
        headers,
      });

      if (response.status === 200) {
        results.success++;
      } else {
        results.failed++;
      }

      //Saving to log table
      const command = new PutItemCommand({
        TableName: process.env.logsTableName!,
        Item: marshall({
          timestamp: Date.now().toString(),
          webhookUrl: subscriber.webhookUrl,
          id: uuid(),
          responseStatus: response.status,
          responseData: JSON.stringify(response.data),
          requestPayload: JSON.stringify(schedule),
        }),
      });

      dynamodbClient.send(command);
    } catch (error) {
      console.log("Axios thrown error", error);

      results.failed++;
    }
  }

  return results;
};
