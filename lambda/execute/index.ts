import { SQSEvent } from "aws-lambda";

export const handler = async (event: SQSEvent) => {
  console.log("Sending whats app message.....");

  console.log("Delete the schedule from the group");

  console.log(
    "Check if the group schedule is empty, if so, trigger the schedule lambda with  the area_name in the layload"
  );

  return {
    body: JSON.stringify({ message: "SUCCESS 🎉" }),
    statusCode: 200,
  };
};
