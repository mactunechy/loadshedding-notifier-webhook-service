export interface Schedule {
  area_name: string;
  stage: string;
  start: string;
  finsh: string;
  source: string;
  scheduleName?: string;
}

export interface Subscriber {
  area_name: string;
  email: string;
  webhookUrl: string;
}
