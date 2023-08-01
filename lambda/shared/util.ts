import moment from "moment";

export function isOneOrMoreHoursInFuture(datetime: string) {
  const inputMoment = moment(datetime);

  const currentTime = moment();

  const differenceInHours = inputMoment.diff(currentTime, "hours");

  return differenceInHours >= 1;
}
