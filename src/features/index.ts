import { BotFeature } from "./types";
import { AnniversaryFeature } from "./AnniversaryFeature";
import { StatusFeature } from "./StatusFeature";
import { LimitedFeature } from "./LimitedFeature";
import { FrequencyFeature } from "./FrequencyFeature";
import { DiaryFeature } from "./DiaryFeature";
import { FortuneFeature } from "./FortuneFeature";
import { AnalyzeFeature } from "./AnalyzeFeature";
import { DJFeature } from "./DJFeature";
import { CheerFeature } from "./CheerFeature";
import { ConversationFeature } from "./ConversationFeature";
import { NormalReplyFeature } from "./NormalReplyFeature";
import { RecapFeature } from "./RecapFeatures";

export const features: BotFeature[] = [
    new AnniversaryFeature(),
    new StatusFeature(),
    new LimitedFeature(),
    new FrequencyFeature(),
    new DiaryFeature(),
    new FortuneFeature(),
    new AnalyzeFeature(),
    new DJFeature(),
    new CheerFeature(),
    new RecapFeature(),
    new ConversationFeature(),
    new NormalReplyFeature(),
];
