# Loadshedding Notifier Webhook service

## Background 

In a world increasingly reliant on constant connectivity, the search for real-time solutions to critical issues has become paramount. The quest to develop a comprehensive system for power outage notifications proved both challenging and enlightening.

Frustrated by the lack of readily available APIs offering real-time updates on power outage schedules,I scoured the internet in hopes of finding a solution that would provide the necessary immediacy. The existing options, such as the Eskom Calendar API, fell short as they required periodic queries.

Then, a spark of inspiration struck: why not create a Platform that leverages the power of webhooks to deliver real-time notifications of power outages in the area? And so, GridWatch was born, with an ambitious aim to revolutionize the way people stay informed about electricity disruptions.


## How it works
This product has a serverless archecture leveraging AWS services

![Diagram](diagram-export-05_08_2023,%2009_08_26.png)

- Firstly Users Signup and create save webhooks that they way to receive notifications to.
- Initially, the Sechduler lambda is invoked manually and it pulls a list of  schedules from the Web
- The lambda then Makes API calls to the EventBridge scheduler service to schedule these events 1 hour before the event time (Abitrary value can be changed as needed)
- When the Event time arrives, the EventBridger Schedule dispatches messages to the SqS queue
- The SQS queue is an event source for the Process Schedule lambda.
- the Process Schedule Lambda Polls messages from the queue, fetchs the appropriate webhooks from the Webhook table. and sends POST requests to these webhooks with the message details as the payload.
- When the Schedules in the  EventBridgeScheduler service have an `ActionAfterCompletion` set to `Delete`, meaning, when the schedule is dispatched to sqs, the schedule is deleted from the EventSchedulerService
- At the end of the ProcessLambda execution, it checks whether there are still upcoming events in the EventBridgeScheduler. if Yes, execution completes, if no, ScheduleLambda is invoked from the ProcessLambda and the cycle repeats again.



## Edge Cases
- In the event that the ScheduleLambda does not get any events from the web, the loop will stop and there i no a mechanism to restart it

## Possible solution
- Convert Schedule Lambda into a cron lambda that runs everyday to check if the EventBridgeScheduler has events, and if not, it fetchs them from the internet. 

