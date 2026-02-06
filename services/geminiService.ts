import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { QuestionRequest, FilePart, SubjectType } from "../types";

const getDynamicInstruction = (mode: string = "GENERAL", subject?: SubjectType): string => {
  const adminConfig = localStorage.getItem('instaq_admin_config');
  if (adminConfig) {
    try {
      const config = JSON.parse(adminConfig);
      if (config.systemInstruction) return config.systemInstruction;
    } catch (e) {
      console.error("Admin config error", e);
    }
  }

  const referenceInstruction = `প্রতিটি উত্তর বা প্রশ্নের শেষে অবশ্যই রেফারেন্স হিসেবে বইয়ের পৃষ্ঠা নম্বর, অনুচ্ছেদ নম্বর এবং লাইন নম্বর উল্লেখ করবে। উদাহরণ: (সূত্র: পৃষ্ঠা-২৪, অনুচ্ছেদ-০২, লাইন-০৮)।`;

  if (subject === SubjectType.MATH) {
    return `তুমি একজন গণিত বিশেষজ্ঞ। গণিত সমাধান করার সময় গাইড বইয়ের মতো হুবহু নিচের ফরম্যাটটি অনুসরণ করো:
    ১. প্রথমে 'সমাধানঃ' লিখবে।
    ২. তারপর 'দেওয়া আছেঃ' লিখে প্রশ্ন থেকে পাওয়া মানগুলো নিচে নিচে লিখবে।
    ৩. এরপর 'আমরা জানি,' লিখে প্রয়োজনীয় সূত্রটি লিখবে।
    ৪. সমাধান করার সময় 'ধাপ ১', 'ধাপ ২', 'ধাপ ৩' বা 'Step 1' এমন কোনো ক্রমিক লেবেল বা নম্বর একদমই ব্যবহার করবে না। সরাসরি অংকটি করবে।
    ৫. অংকের মধ্যে 'গুণ' বা 'ভাগ' শব্দগুলো না লিখে গাণিতিক চিহ্ন (যেমন: × এবং ÷) ব্যবহার করবে। 
    ৬. প্রতিটি গাণিতিক ধাপ আলাদা আলাদা লাইনে নিচে নিচে লিখবে।
    ৭. উত্তরের শেষে অবশ্যই একক উল্লেখ করবে।
    ৮. শেষে তথ্যসূত্র প্রদান করবে: ${referenceInstruction}`;
  }

  if (mode === 'CHAT' || mode === 'SEARCH') {
    return `তুমি একজন বিশেষজ্ঞ শিক্ষক। তোমার উত্তরের ফরম্যাট নিচের মতো হতে হবে:
    ১. সমাধানঃ উত্তরটি সরাসরি এবং যৌক্তিকভাবে সাজিয়ে দাও। কোনোভাবেই 'ধাপ ১', 'ধাপ ২' বা 'Step 1' জাতীয় লেবেল ব্যবহার করবে না। 
    ২. তথ্যসূত্রঃ ${referenceInstruction}
    ৩. স্টাইলঃ কোনো মার্কডাউন (যেমন **, #) ব্যবহার করবে না। কন্টেন্ট ঘন করে সাজিয়ে লিখবে।`;
  }

  return `তুমি একজন দক্ষ প্রশ্নপত্র প্রস্তুতকারক। 
  ১. রেফারেন্সঃ প্রতিটি প্রশ্নের শেষে (পৃষ্ঠা, অনুচ্ছেদ, লাইন) অবশ্যই ব্র্যাকেটে উল্লেখ করো।
  ২. স্টাইলঃ টেক্সট এর মাঝে কোনো ** বা মার্কডাউন ফরম্যাটিং ব্যবহার করবে না। কোনো প্রকার 'ধাপ' বা 'স্টেপ' লেবেল ব্যবহার করবে না।
  ৩. গঠনঃ বিষয়বস্তুগুলো মার্জিত ভাষায় আলাদা লাইনে লিখবে।`;
};

const incrementUsage = (userId: string) => {
  const users = JSON.parse(localStorage.getItem('instaq_db_users') || '[]');
  const updatedUsers = users.map((u: any) => {
    if (u.id === userId) return { ...u, usageCount: (u.usageCount || 0) + 1 };
    return u;
  });
  localStorage.setItem('instaq_db_users', JSON.stringify(updatedUsers));
};

export const generateQuestionsFromImages = async (
  files: FilePart[],
  request: QuestionRequest,
  subject: SubjectType,
  customPrompt: string = "",
  userId: string = "guest"
): Promise<string> => {
  // এপিআই কি সরাসরি process.env থেকে নেওয়া হচ্ছে যা Vite দ্বারা ইনজেক্ট করা
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error('API Key missing. Please check Vercel settings.');

  const ai = new GoogleGenAI({ apiKey });

  const typesDetails = Object.entries(request)
    .filter(([_, config]) => config.enabled)
    .map(([key, config]) => `${key}: ${config.count}টি`)
    .join(', ');

  const prompt = `
    ${getDynamicInstruction('GENERATE', subject)}
    বিষয়: ${subject}
    প্রশ্নের ধরণ: ${typesDetails}
    ব্যবহারকারীর বিশেষ নির্দেশ: ${customPrompt || "বইয়ের তথ্য অনুযায়ী নিখুঁত প্রশ্ন ও উত্তর তৈরি করো।"}
    নির্দেশ: ফাইল থেকে তথ্য নিয়ে প্রশ্ন ও উত্তর তৈরি করো। প্রতিটি প্রশ্নের শেষে অবশ্যই (পৃষ্ঠা-X, অনুচ্ছেদ-Y, লাইন-Z) রেফারেন্স দাও। কোনো 'ধাপ' লেবেল ব্যবহার করবে না।
  `;

  const parts = files.map(file => ({
    inlineData: { mimeType: file.mimeType, data: file.data.split(',')[1] || file.data },
  }));

  const modelName = (subject === SubjectType.MATH || subject === SubjectType.SCIENCE) 
    ? 'gemini-3-pro-preview' 
    : 'gemini-3-flash-preview';

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: modelName,
      contents: { parts: [...parts, { text: prompt }] },
    });
    incrementUsage(userId);
    return cleanResponse(response.text || '');
  } catch (error: any) {
    console.error("Generation Error:", error);
    throw new Error('AI প্রসেসিং করতে ব্যর্থ হয়েছে।');
  }
};

export const solveAnyQuery = async (
  files: FilePart[],
  query: string,
  subject: SubjectType,
  mode: string,
  userId: string = "guest"
): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error('API Key missing.');

  const ai = new GoogleGenAI({ apiKey });
  const systemPrompt = getDynamicInstruction(mode, subject);
  
  const prompt = `
    ${systemPrompt}
    বিষয়: ${subject}
    ব্যবহারকারীর জিজ্ঞাসা: "${query}"
    নির্দেশ: উত্তরটি রেফারেন্স সহ নিখুঁতভাবে তৈরি করো। কোনো 'ধাপ' লেবেল ব্যবহার করবে না।
  `;

  const parts: any[] = [];
  if (files && files.length > 0) {
    files.forEach(file => {
      parts.push({
        inlineData: { mimeType: file.mimeType, data: file.data.split(',')[1] || file.data },
      });
    });
  }
  parts.push({ text: prompt });

  const modelName = (subject === SubjectType.MATH || subject === SubjectType.SCIENCE) 
    ? 'gemini-3-pro-preview' 
    : 'gemini-3-flash-preview';

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
    });
    incrementUsage(userId);
    return cleanResponse(response.text || '');
  } catch (error: any) {
    console.error("Solve Error:", error);
    throw new Error('সমাধান পাওয়া যায়নি।');
  }
};

const cleanResponse = (text: string): string => {
  return text
    .replace(/\*\*/g, '') 
    .replace(/###/g, '')   
    .replace(/##/g, '')    
    .replace(/#/g, '')     
    .replace(/ধাপ\s*[০-৯0-9]+\s*[:।-]\s*/gi, '') 
    .replace(/Step\s*[0-9]+\s*[:।-]\s*/gi, '')   
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n') 
    .replace(/\*/g, '×') 
    .trim();
};