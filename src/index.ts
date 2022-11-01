import * as core from '@actions/core';
import * as github from '@actions/github';
import { EventBridgeClient, PutRuleCommand } from '@aws-sdk/client-eventbridge';
import { ECSClient, DescribeClustersCommand } from '@aws-sdk/client-ecs';

type TeventPattern = {
    source: string[];
    'detail-type'?: string[];
    detail?: { [key: string]: (string | undefined)[] | undefined }

}

const REGION = core.getInput('region');

const EVENT_CATEGORY = {
    'STATE_CHANGE': ['ECS Task State Change', 'ECS Container Instance State Change', 'ECS Deployment State Change'],
}

async function buildEventPattern() {

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
            case 'CloudTrail_API_CALL':
                eventPattern['detail-type'] = ["AWS API Call via CloudTrail"]
                const eventName = core.getInput('event-name');
                eventPattern['detail'] = {
                    eventSource: ["ecs.amazonaws.com"],
                    eventName: [eventName]
                }
            default:
                break;
        }
    } catch(e) {
        core.setFailed(e.message);
    }
    console.log(eventPattern)
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
    const name = 'test-rule-2' ?? core.getInput('name');
    const decsription = 'test-rule-2' ?? core.getInput('decsription');
    const eventBus = 'default' ?? core.getInput('event-bus');
    const client = new EventBridgeClient({
        region: REGION
    });

    const command = new PutRuleCommand({
        Name: name,
        Description: decsription,
        EventBusName: eventBus,
        EventPattern: eventPattern
    });
    const res = await client.send(command);
    console.log(res);
}

async function run() {
    
    try {
        const eventPattern = buildEventPattern();
        await putRule(JSON.stringify(eventPattern));
    } catch(e) {
        core.setFailed(e.message);
    }
}

run()