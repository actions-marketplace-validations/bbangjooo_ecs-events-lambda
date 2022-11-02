## Usage

```yaml
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

See [action.yml](/bbangjooo/ecs-eb-lambda-actions/blob/develop/action.yml) for the full documentation for inputs and outputs.