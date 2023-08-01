import {
  BatchWriteItemCommand,
  DynamoDBClient,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { DynamoDBStreamEvent } from "aws-lambda";
import { v4 as uuid } from "uuid";

import axios from "axios";
import { isOneOrMoreHoursInFuture } from "../shared/util";

interface Schedule {
  area_name: string;
  stage: string;
  start: string;
  finsh: string;
  source: string;
}

const client = new DynamoDBClient({ region: "us-west-2" });

export const handler = async (event: DynamoDBStreamEvent) => {
  console.log("event", JSON.stringify(event.Records, null, 2));

  const removeEvent = event.Records.find(
    (record) => record.eventName === "REMOVE"
  );

  console.log(JSON.stringify(removeEvent, null, 2));

  if (!removeEvent?.dynamodb?.OldImage)
    return console.log("No schedule old image");

  const schedule = unmarshall(removeEvent.dynamodb.OldImage as any);

  const queryCommand = new QueryCommand({
    TableName: process.env.tableName,
    IndexName: "areaNameIndex",
    KeyConditionExpression: "area_name = :val",
    ExpressionAttributeValues: {
      ":val": { S: schedule.area_name.toString() },
    },
  });
  const res = await client.send(queryCommand);

  //Do nothing there is still schedules
  if (!res.Items || res.Items?.length > 0)
    return console.log("still have schedules. no need to fetch more");

  const url =
    "https://eskom-calendar-api.shuttleapp.rs/outages/city-of-cape-town-area-7";

  console.log("Fetching schedules....\n");
  const response = await axios.get(url);
  const schedules: Schedule[] = response.data;
  console.log("Schedules: \n", schedules);

  //Remove old schedules
  const filteredSchedules = schedules.filter((schedule) =>
    isOneOrMoreHoursInFuture(schedule.start)
  );

  const command = new BatchWriteItemCommand({
    RequestItems: {
      [process.env.tableName!]: filteredSchedules.map((schedule) => ({
        PutRequest: {
          Item: {
            id: { S: uuid() },
            area_name: { S: schedule.area_name },
            stage: { S: schedule.stage.toString() },
            start_time: { S: schedule.start },
            finish_time: { S: schedule.finsh },
          },
        },
      })),
    },
    ReturnItemCollectionMetrics: "SIZE",
  });

  console.log("Saving to db \n");

  const result = await client.send(command);

  console.log(result);

  return {
    body: JSON.stringify({ message: "SUCCESS 🎉" }),
    statusCode: 200,
  };
};
