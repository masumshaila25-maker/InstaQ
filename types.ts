
export enum QuestionType {
  MCQ = 'বহুনির্বাচনি প্রশ্ন (MCQ)',
  FILL_IN_BLANKS = 'শূন্যস্থান পূরণ',
  TRUE_FALSE = 'সত্য-মিথ্যা',
  BRIEF = 'সংক্ষিপ্ত প্রশ্ন',
  DESCRIPTIVE = 'বর্ণনামূলক প্রশ্ন'
}

export interface QuestionConfig {
  enabled: boolean;
  count: number;
}

export interface QuestionRequest {
  [key: string]: QuestionConfig;
}

export interface FilePart {
  data: string;
  mimeType: string;
  name: string;
}

export interface GenerationResult {
  id: string;
  content: string;
  timestamp: string;
  imageCount: number;
}
