import { MAP_GENERATION_CONFIG, MAP_GENERATOR_VERSION, MAP_VALIDATOR_VERSION } from '../data/stageData';
export const GENERATOR_VERSION = MAP_GENERATOR_VERSION;
export const VALIDATOR_VERSION = MAP_VALIDATOR_VERSION;
export type GenerationConfig = typeof MAP_GENERATION_CONFIG;
export const DEFAULT_CONFIG: Readonly<GenerationConfig> = Object.freeze({...MAP_GENERATION_CONFIG});
