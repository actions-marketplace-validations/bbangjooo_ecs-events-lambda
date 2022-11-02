import * as core from '@actions/core';
import { EventBridgeClient, PutRuleCommand } from '@aws-sdk/client-eventbridge';
import { ECSClient, DescribeClustersCommand } from '@aws-sdk/client-ecs';
import * as aws from 'aws-sdk';
import { randomUUID } from 'crypto';

type TeventPattern = {
    source: string[];
    'detail-type'?: string[];
    detail?: { [key: string]: (string | undefined)[] | undefined }

}

const REGION = core.getInput('region');

const EVENT_CATEGORY = {
    'STATE_CHANGE': ['ECS Task State Change', 'ECS Container Instance State Change', 'ECS Deployment State Change'],
}

async function buildEventPattern(): Promise<TeventPattern> {

    const clusters: string[] = core.getMultilineInput('clusters');
    const eventType: string = core.getInput('event-type');
    const detailEventType: string[] = core.getMultilineInput('detail-event-type');
    let eventPattern: TeventPattern = {
        source: ["aws.ecs"]
    };
    try {
        switch(eventType) {
            case 'STATE_CHANGE':
                if (detailEventType.length === 0) {
                    eventPattern['detail-type'] = EVENT_CATEGORY[eventType]
                } else {
                    let notFoundFlag = 0;
                    const detailTypeInput = Array.from(new Set(detailEventType));
                    detailTypeInput.map(d => {
                        if(!EVENT_CATEGORY['STATE_CHANGE'].includes(d)) {
                            notFoundFlag = 1;
                        }
                    });
                    if (notFoundFlag) {
                        throw `detail-event-type should be in ${EVENT_CATEGORY[eventType]}`
                    }
                    eventPattern['detail-type'] = detailTypeInput;
                }
    
                if (clusters.length > 0) {
                    eventPattern['detail'] = {
                        clusterArn: await getClusterArns(clusters)
                    }
                }
                break;
            case 'CloudTrail_API_CALL':
                eventPattern['detail-type'] = ["AWS API Call via CloudTrail"]
                eventPattern['detail'] = {
                    eventSource: ["ecs.amazonaws.com"],
                }
                const eventName = core.getInput('event-name');
                if (eventName.length > 0) {
                    eventPattern['detail']['eventName'] = [eventName];
                }
                break;
            default:
                break;
        }
    } catch(e) {
        core.setFailed(e.message);
    }
    core.info('[*] EventPattern');
    core.info(JSON.stringify(eventPattern));
    return eventPattern;

}

async function getClusterArns(clusters: string[]): Promise<(string | undefined)[] | undefined> {
    const client = new ECSClient({
        region: REGION
    });
    const command = new DescribeClustersCommand({
        clusters
    });
    try {
        const { clusters: foundClusters } = await client.send(command);
        if (!clusters) {
            throw `clusters not found: ${clusters}`
        }
        const clusterArns = foundClusters?.map(c => c.clusterArn);
        return clusterArns;
    } catch(e) {
        core.setFailed(e.message);
    }
}

async function putRule(eventPattern: string) {
    const name = core.getInput('name');
    const decsription = core.getInput('decsription');
    const eventBus = core.getInput('event-bus');
    try {
        const client = new EventBridgeClient({
            region: REGION
        });
    
        const command = new PutRuleCommand({
            Name: name,
            Description: decsription,
            EventBusName: eventBus === '' ? 'default' : eventBus,
            EventPattern: eventPattern
        });
        const res = await client.send(command);
        core.info(JSON.stringify(res));
        core.info('[+] Successfully create a rule');
    } catch(e) {
        core.setFailed(e.message);
    }
}

async function getLambdaFunction(functionName: string) {
    const lambda = new aws.Lambda()
    let functionArn: string = '';
    try { 
        const params: aws.Lambda.Types.GetFunctionRequest = {
            FunctionName: functionName
        }
        const foundFunc = await lambda.getFunction(params).promise()
        if (foundFunc.Configuration) {
            functionArn = foundFunc.Configuration?.FunctionArn;
        }
        
    } catch(e) {
        core.setFailed(e.message);
    }
    return functionArn;
}

async function putTargets() {
    const name = core.getInput('name');
    const functionName = core.getInput('lambda-function-name');
    try {
        let params: aws.EventBridge.Types.PutTargetsRequest = {
            Rule: name,
            Targets: [
                {
                    Arn: await getLambdaFunction(functionName),
                    Id: randomUUID()
                }
            ]
        };
        const eb = new aws.EventBridge();
        await eb.putTargets(params).promise();
        core.info('[+] Successfully link target to the rule');
    } catch(e) {
        core.setFailed(e.message);
    }
}

async function run() {
   try {
        const eventPattern = await buildEventPattern();
        await putRule(JSON.stringify(eventPattern));
        await putTargets();
    } catch(e) {
        core.setFailed(e.message);
    }
}

run()