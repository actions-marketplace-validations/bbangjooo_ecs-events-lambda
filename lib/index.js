"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const client_eventbridge_1 = require("@aws-sdk/client-eventbridge");
const client_ecs_1 = require("@aws-sdk/client-ecs");
const aws = __importStar(require("aws-sdk"));
const crypto_1 = require("crypto");
const REGION = core.getInput('region');
const EVENT_CATEGORY = {
    'STATE_CHANGE': ['ECS Task State Change', 'ECS Container Instance State Change', 'ECS Deployment State Change'],
};
function buildEventPattern() {
    return __awaiter(this, void 0, void 0, function* () {
        const clusters = core.getMultilineInput('clusters');
        core.info(String(clusters));
        const eventType = core.getInput('event-type');
        const detailEventType = core.getMultilineInput('detail-event-type');
        let eventPattern = {
            source: ["aws.ecs"]
        };
        try {
            switch (eventType) {
                case 'STATE_CHANGE':
                    if (detailEventType.length === 0) {
                        eventPattern['detail-type'] = EVENT_CATEGORY[eventType];
                    }
                    else {
                        let notFoundFlag = 0;
                        const detailTypeInput = Array.from(new Set(detailEventType));
                        detailTypeInput.map(d => {
                            if (!EVENT_CATEGORY['STATE_CHANGE'].includes(d)) {
                                notFoundFlag = 1;
                            }
                        });
                        if (notFoundFlag) {
                            throw `detail-event-type should be in ${EVENT_CATEGORY[eventType]}`;
                        }
                        eventPattern['detail-type'] = detailTypeInput;
                    }
                    if (clusters.length > 0) {
                        eventPattern['detail'] = {
                            clusterArn: yield getClusterArns(clusters)
                        };
                    }
                case 'CloudTrail_API_CALL':
                    eventPattern['detail-type'] = ["AWS API Call via CloudTrail"];
                    const eventName = core.getInput('event-name');
                    eventPattern['detail'] = {
                        eventSource: ["ecs.amazonaws.com"],
                        eventName: [eventName]
                    };
                default:
                    break;
            }
        }
        catch (e) {
            core.setFailed(e.message);
        }
        return eventPattern;
    });
}
function getClusterArns(clusters) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = new client_ecs_1.ECSClient({
            region: REGION
        });
        const command = new client_ecs_1.DescribeClustersCommand({
            clusters
        });
        try {
            const { clusters: foundClusters } = yield client.send(command);
            if (!clusters) {
                throw `clusters not found: ${clusters}`;
            }
            const clusterArns = foundClusters === null || foundClusters === void 0 ? void 0 : foundClusters.map(c => c.clusterArn);
            return clusterArns;
        }
        catch (e) {
            core.setFailed(e.message);
        }
    });
}
function putRule(eventPattern) {
    return __awaiter(this, void 0, void 0, function* () {
        const name = core.getInput('name');
        const decsription = core.getInput('decsription');
        const eventBus = core.getInput('event-bus');
        try {
            const client = new client_eventbridge_1.EventBridgeClient({
                region: REGION
            });
            const command = new client_eventbridge_1.PutRuleCommand({
                Name: name,
                Description: decsription,
                EventBusName: eventBus === '' ? 'default' : eventBus,
                EventPattern: eventPattern
            });
            const res = yield client.send(command);
            core.info(JSON.stringify(res));
        }
        catch (e) {
            core.setFailed(e.message);
        }
    });
}
function getLambdaFunction(functionName) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const lambda = new aws.Lambda();
        let functionArn = '';
        try {
            const params = {
                FunctionName: functionName
            };
            const foundFunc = yield lambda.getFunction(params).promise();
            if (foundFunc.Configuration) {
                functionArn = (_a = foundFunc.Configuration) === null || _a === void 0 ? void 0 : _a.FunctionArn;
            }
        }
        catch (e) {
            core.setFailed(e.message);
        }
        if (functionArn === '') {
            core.setFailed('Function Not Found');
        }
        core.info(`[*] functionArn: ${functionArn}`);
        return functionArn;
    });
}
function putTargets() {
    return __awaiter(this, void 0, void 0, function* () {
        const name = core.getInput('name');
        const functionName = core.getInput('lambda-function-name');
        try {
            let params = {
                Rule: name,
                Targets: [
                    {
                        Arn: yield getLambdaFunction(functionName),
                        Id: (0, crypto_1.randomUUID)()
                    }
                ]
            };
            const eb = new aws.EventBridge();
            yield eb.putTargets(params).promise();
        }
        catch (e) {
            core.setFailed(e.message);
        }
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const eventPattern = yield buildEventPattern();
            yield putRule(JSON.stringify(eventPattern));
            yield putTargets();
        }
        catch (e) {
            core.setFailed(e.message);
        }
    });
}
run();
