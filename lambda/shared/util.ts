import moment from "moment";

export function isOneOrMoreHoursInFuture(datetime: string) {
  const inputMoment = moment(datetime);

  const currentTime = moment();

  const differenceInHours = inputMoment.diff(currentTime, "hours");

  return differenceInHours >= 1;
}

export function calculateSchedulingTime(inputDateStr: string) {
  const momentDate = moment(inputDateStr);

  // Schedule for an hour before loadingshedding //HACK: figure out the proper way to deal with dates
  const scheduleTime = momentDate.add(1, "hour");

  /**
   * Eventbridge schedule expression  date format
   * @see {@link https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html#one-time}
   */

  return scheduleTime.format("YYYY-MM-DDTHH:mm:ss");
}
