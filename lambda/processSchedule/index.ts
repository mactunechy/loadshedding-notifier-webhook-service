import {
  DeleteScheduleCommand,
  ListSchedulesCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import { SQSEvent } from "aws-lambda";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

import { Schedule } from "../shared/types";

const schedulerClient = new SchedulerClient({ region: "us-west-2" });
const lambadClient = new LambdaClient({ region: "us-west-2" });

export const handler = async (event: SQSEvent) => {
  const scheduleData: Schedule[] = event.Records.map((message) =>
    JSON.parse(message.body)
  );

  console.log("Sending whats app message.....");

  console.log("Delete the schedule from the group");

  await Promise.all(
    scheduleData.map(async (event) => {
      const command = new DeleteScheduleCommand({
        Name: event.scheduleName,
        GroupName: event.area_name,
      });

      await schedulerClient.send(command);
    })
  );

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
