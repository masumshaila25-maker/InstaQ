
export enum QuestionType {
  MCQ = 'বহুনির্বাচনি প্রশ্ন (MCQ)',
  FILL_IN_BLANKS = 'শূন্যস্থান পূরণ',
  TRUE_FALSE = 'সত্য-মিথ্যা',
  BRIEF = 'সংক্ষিপ্ত প্রশ্ন',
  DESCRIPTIVE = 'বর্ণনামূলক প্রশ্ন',
  CREATIVE = 'সৃজনশীল প্রশ্ন'
}

export enum SubjectType {
  BENGALI = 'বাংলা',
  ENGLISH = 'ইংরেজি',
  MATH = 'গণিত',
  SCIENCE = 'বিজ্ঞান',
  BGS = 'বাংলাদেশ ও বিশ্বপরিচয়',
  ISLAM = 'ইসলাম ও নৈতিক শিক্ষা',
  GENERAL = 'সাধারণ'
}

export enum AppMode {
  GENERATE = 'GENERATE',
  SEARCH = 'SEARCH',
  CHAT = 'CHAT'
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

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export interface GenerationResult {
  id: string;
  content: string;
  timestamp: string;
  imageCount: number;
  mode: AppMode;
  subject?: SubjectType;
  userQuestion?: string;
  chatLog?: ChatMessage[];
}
