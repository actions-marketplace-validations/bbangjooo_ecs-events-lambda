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
const REGION = core.getInput('region');
const EVENT_CATEGORY = {
    'STATE_CHANGE': ['ECS Task State Change', 'ECS Container Instance State Change', 'ECS Deployment State Change'],
};
function buildEventPattern() {
    return __awaiter(this, void 0, void 0, function* () {
        const clusters = core.getMultilineInput('clusters');
        const eventType = core.getInput('event-type');
        const detailEventType = core.getMultilineInput('detail-event-type');
        let eventPattern = {
            source: ["aws.ecs"]
        };
        core.debug(JSON.stringify(eventPattern));
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
            core.debug(JSON.stringify(eventPattern));
            core.setFailed(e.message);
        }
        core.debug(JSON.stringify(eventPattern));
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
        const name = 'test-rule-2' !== null && 'test-rule-2' !== void 0 ? 'test-rule-2' : core.getInput('name');
        const decsription = 'test-rule-2' !== null && 'test-rule-2' !== void 0 ? 'test-rule-2' : core.getInput('decsription');
        const eventBus = 'default' !== null && 'default' !== void 0 ? 'default' : core.getInput('event-bus');
        try {
            const client = new client_eventbridge_1.EventBridgeClient({
                region: REGION
            });
            const command = new client_eventbridge_1.PutRuleCommand({
                Name: name,
                Description: decsription,
                EventBusName: eventBus,
                EventPattern: eventPattern
            });
            const res = yield client.send(command);
        }
        catch (e) {
            core.setFailed(e.message);
        }
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        core.info('running');
        try {
            const eventPattern = buildEventPattern();
            yield putRule(JSON.stringify(eventPattern));
        }
        catch (e) {
            core.debug('hi');
            core.setFailed(e.message);
        }
    });
}
run();
