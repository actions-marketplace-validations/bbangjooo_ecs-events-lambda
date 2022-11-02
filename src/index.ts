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
    core.info(String(clusters));
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
    } catch(e) {
        core.setFailed(e.message);
    }
}

async function getLambdaRole(roleName: string): Promise<string> {
    let role;
    try {
        const iam = new aws.IAM();
        role = await iam.getRole({ RoleName: roleName }).promise();
    } catch(e) {
        core.setFailed(e.message);
    }
    return role.Role.Arn;

}

async function createLambdaFunction(zipFileName: string, funcName: string, roleName: string, handler: string, description: string, envs?: string[]) {
    try { 
        let params: aws.Lambda.Types.CreateFunctionRequest = {
            Code: {
                ZipFile: zipFileName
            },
            FunctionName: funcName,
            Role: await getLambdaRole(roleName),
            Handler: handler,
            Runtime: 'nodejs14.x',
            Description: description,
        };
        let envVariables: { 'Variables': { [key: string]: string} } = { 'Variables': {} }
        if (envs) {
            envs.map(e => {
                const [ key, value ] = e.trim().split('=')
                envVariables['Variables'][key] = value
            });
            params.Environment = envVariables;
        }
        const lambda = new aws.Lambda()
        lambda.createFunction(params, (err, data) => {
            if (err) core.setFailed(err);
            else core.info('[*] Lambda function successsfully created');
        })
    } catch(e) {
        core.setFailed(e.message);
    }
}

async function getLambdaFunction(functionName: string) {
    const lambda = new aws.Lambda()
    let foundFunc;
    try { 
        const params: aws.Lambda.Types.GetFunctionRequest = {
            FunctionName: functionName
        }
        const foundFunc = await lambda.getFunction(params).promise();
    } catch(e) {
        core.setFailed(e.message);
    }
    return foundFunc.Configuration?.FunctionArn;
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
        const eb = new aws.EventBridge()
        await eb.putTargets(params).promise()
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