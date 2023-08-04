import {
  ActionAfterCompletion,
  CreateScheduleCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import {
  calculateSchedulingTime,
  isOneOrMoreHoursInFuture,
} from "../shared/util";
import axios from "axios";
import { v4 as uuid } from "uuid";
import { Schedule } from "../shared/types";

const client = new SchedulerClient({ region: process.env.AWS_REGION });

export const handler = async (event: any) => {
  console.log("Event", event);

  //For testing purposes
  if (event.test) {
    const scheduleName = `${event.area_name}_${uuid()}`;
    return createSchedule(event as Schedule, scheduleName);
  }

  const areas: String[] = event.areas
    ? event.areas
    : JSON.parse(process.env.scheduleGroups!);

  console.log("Areas to be looked up", areas);

  const schedules = await Promise.all(
    areas.map(async (area) => {
      const url = `https://eskom-calendar-api.shuttleapp.rs/outages/${area}`;

      const response = await axios.get(url);

      const schedules: Schedule[] = response.data;
      return schedules;
    })
  );

  console.log("Events to be scheduled: before filter", schedules.flat().length);

  //Remove old schedules
  const filteredSchedules = schedules
    .flat()
    .filter((schedule) => isOneOrMoreHoursInFuture(schedule.start));

  if (filteredSchedules.length === 0) return console.log("No schedules...");

  console.log("Events to be scheduled", filteredSchedules.length);

  const scheduleArns = await Promise.all(
    filteredSchedules.map((schedule) => {
      const shedule_name = `${filteredSchedules[0].area_name}_${uuid()}`;
      return createSchedule(schedule, shedule_name);
    })
  );

  console.log("ScheduleArn", scheduleArns);

  return {
    body: JSON.stringify({ message: "SUCCESS 🎉" }),
    statusCode: 200,
  };
};

const createSchedule = async (
  schedule: Schedule,
  scheduleName: string
): Promise<string | undefined> => {
  const command = new CreateScheduleCommand({
    FlexibleTimeWindow: { Mode: "OFF" },
    Name: scheduleName,
    GroupName: schedule.area_name,
    ScheduleExpression: `at(${calculateSchedulingTime(schedule.start)})`,
    ScheduleExpressionTimezone: process.env.timezone,
    Target: {
      Arn: process.env.targetArn,
      RoleArn: process.env.targetRoleArn,
      Input: JSON.stringify({ ...schedule, scheduleName }),
    },
    ActionAfterCompletion: ActionAfterCompletion.DELETE,
  });

  const response = await client.send(command);

  return response.ScheduleArn;
};
