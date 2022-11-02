## Usage

```yaml
- uses: actions/checkout@v2

- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v1
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: ap-northeast-2

- uses: bbangjooo/ecs-events-lambda@v1
  with:
    name: rule-name
    description: rule-description
    region: ap-northeast-2
    lambda-function-name: lambda function name wanted to be listen to the event rule
    event-type: STATE_CHANGE 
    clusters: | 
      EcsAlardinBackendCluter
```

Use this action to connect AWS ECS clusters to lambda function using [AWS EventBridge](https://aws.amazon.com/ko/eventbridge/). General workflow is like:

1. Create clusters using AWS ECS.
2. Create lambda function for your own usage.
3. Use this action as an side menu when you deploy task definition to the ECS service

Use [the `aws-actions/configure-aws-credentials` action](https://github.com/aws-actions/configure-aws-credentials) to configure the GitHub Actions environment with environment variables containing AWS credentials and your desired region. See [action.yml](/bbangjooo/ecs-eb-lambda-actions/blob/develop/action.yml) for the full documentation for inputs and outputs. You can also reference Inputs section below for this action's input. 

## Inputs

```yaml
name:
    description: 'The name of the event rule'
    required: true
description:
    description: 'The description of the event rule'
    required: true
region:
    description: 'AWS region. The region of AWS ECS should be same as the one of AWS EventBridge.'
    required: true
lambda-function-name:
    description: 'The name of listener lambda function. This action assume that lambda function is already created.'
    required: true
event-bus:
    description: 'The event bus which this rule will be set. Default is "default"'
    required: false
clusters:
    description: "The names of the ECS service's cluster(optional). If you want to specify targeted clusters, give ARNs of cluster as multi-line input. Default is all clusters."
    required: false
event-type: # 'STATE_CHANGE' | 'CLOUDTRAIL_API_CALL'
    description: 'The types of the event(optional). Default is listening to every events'
    required: false
detail-event-type: # "ECS Task State Change" | "ECS Container Instance State Change" | "ECS Deployment State Change"
    description: 'The detailed types of event(optional). This input should be used with STATE_CHANGE event type. If you want to specify detailed event types, give it as multi-line input. Default is all detailed-events.'
    required: false
event-name:
    description: 'The event name of API Call through CloudTrail(optional). More info: https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-aws-service-specific-topics.html'
    required: false
```

If you want to make the rule listen to specific event, describe it to input `event-type`. When you use 'STATE_CHANGE' as a value for `event-type`, you can set detailed event type which is commented in [action.yml](/bbangjooo/ecs-eb-lambda-actions/blob/develop/action.yml). Otherwise, 'CLOUDTRAIL_API_CALL' event type can be used with `event-name` input which is the api call you want the rule to listen to.