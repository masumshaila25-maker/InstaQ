
/**
 * Global definitions for the InstaQ app.
 * Note: AIStudio and window.aistudio declarations have been removed to avoid duplication errors 
 * with the environment's pre-existing global definitions.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_KEY: string;
  }
}

export {};
