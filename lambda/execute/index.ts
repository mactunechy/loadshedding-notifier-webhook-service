export const handler = async (event: any) => {
  console.log("Working execute");

  return {
    body: JSON.stringify({ message: "SUCCESS 🎉" }),
    statusCode: 200,
  };
};
