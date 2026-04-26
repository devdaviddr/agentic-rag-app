export interface ResolvedSettings {
  ollamaBaseUrl: string;
  chatModel: string;
  embedModel: string;
  visionModel: string;
  chatTemperature: number;
  ragTopK: number;
  ragChunkSize: number;
  ragChunkOverlap: number;
}
