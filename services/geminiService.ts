
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { QuestionType, QuestionRequest, FilePart, SubjectType } from "../types";

const getSystemInstruction = (subject: SubjectType, mode: string): string => {
  let instruction = `
    তুমি একজন দক্ষ শিক্ষাবিদ এবং অল-ইন-ওয়ান স্টাডি অ্যাসিস্ট্যান্ট। 
    প্রদত্ত ফাইল বা কন্টেন্ট নিখুঁতভাবে বিশ্লেষণ করো। 
    ১. টেক্সট এর মাঝে কোনো প্রকার ** (ডাবল অ্যাস্টেরিস্ক) বা মার্কডাউন ফরম্যাটিং ব্যবহার করবে না। 
    ২. উত্তরের সাথে প্রাসঙ্গিক হলে রেফারেন্স বা সূত্র উল্লেখ করবে। 
    ৩. তথ্যগুলো শুদ্ধ বানানে লিখবে।
  `;

  if (subject === SubjectType.ENGLISH) {
    instruction += `\nনির্দেশ: বিষয় ইংরেজি। গ্রামার বা টেক্সট সবকিছুর ব্যাখ্যা ইংরেজিতে দাও। Rules এবং Examples স্পষ্টভাবে তুলে ধরো।`;
  } else if (subject === SubjectType.MATH) {
    instruction += `\nনির্দেশ: বিষয় গণিত। যেকোনো সমস্যার সমাধান 'ধাপ অনুযায়ী' (Step-by-Step) করো। প্রতিটি ধাপের যুক্তি সংক্ষেপে লিখো।`;
  } else if (subject === SubjectType.BENGALI) {
    instruction += `\nনির্দেশ: বাংলা ব্যাকরণের ক্ষেত্রে (যেমন- কারক, সমাস, সন্ধি) নিয়ম এবং উদাহরণ স্পষ্টভাবে দাও।`;
  } else if (subject === SubjectType.ISLAM) {
    instruction += `\nনির্দেশ: ধর্মীয় তথ্যের ক্ষেত্রে কুরআন ও হাদিসের সঠিক রেফারেন্স ও নৈতিক শিক্ষা বজায় রাখবে।`;
  }

  if (mode === 'CHAT') {
    instruction += `\nতুমি এখন "জিজ্ঞাসা ও সমাধান" চ্যাট মোডে আছো। ব্যবহারকারীর যেকোনো সাধারণ প্রশ্ন, গণিত, বা গ্রামারের সমস্যার সমাধান দাও। যদি কোনো ফাইল আপলোড করা না থাকে, তবে তোমার বিশাল জ্ঞানভাণ্ডার থেকে সঠিক উত্তর দাও।`;
  }

  return instruction;
};

export const generateQuestionsFromImages = async (
  files: FilePart[],
  request: QuestionRequest,
  subject: SubjectType
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const typesDetails = Object.entries(request)
    .filter(([_, config]) => config.enabled)
    .map(([key, config]) => `${key}: ${config.count}টি`)
    .join(', ');

  const prompt = `
    ${getSystemInstruction(subject, 'GENERATE')}
    তুমি এখন "${subject}" বিষয়ের প্রশ্নপত্র প্রণয়নকারী। 
    অনুরোধকৃত প্রশ্নের তালিকা ও সংখ্যা: ${typesDetails}
    নির্দেশ: প্রদত্ত কন্টেন্ট থেকে উপরের ধরণ অনুযায়ী প্রশ্ন ও উত্তর তৈরি করো। কোনো মার্কডাউন ব্যবহার করবে না।
  `;

  const parts = files.map(file => ({
    inlineData: {
      mimeType: file.mimeType,
      data: file.data.split(',')[1] || file.data,
    },
  }));

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [...parts, { text: prompt }] },
    });
    return cleanResponse(response.text || '');
  } catch (error) {
    console.error('Error generating questions:', error);
    throw new Error('AI থেকে রেসপন্স পেতে সমস্যা হয়েছে।');
  }
};

export const solveAnyQuery = async (
  files: FilePart[],
  query: string,
  subject: SubjectType,
  mode: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    ${getSystemInstruction(subject, mode)}
    বিষয়: "${subject}"
    ব্যবহারকারীর প্রশ্ন/সমস্যা: "${query}"
    
    নির্দেশ: যদি ফাইল থাকে তবে ফাইল থেকে উত্তর দাও, নতুবা তোমার বুদ্ধিমত্তা ব্যবহার করে গণিত হলে সমাধান, গ্রামার হলে ব্যাখ্যাসহ উত্তর দাও। কোনো মার্কডাউন ব্যবহার করবে না।
  `;

  const parts: any[] = [];
  if (files && files.length > 0) {
    files.forEach(file => {
      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.data.split(',')[1] || file.data,
        },
      });
    });
  }
  parts.push({ text: prompt });

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
    });
    return cleanResponse(response.text || '');
  } catch (error) {
    console.error('Error solving query:', error);
    throw new Error('সমাধান পেতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
  }
};

export const refineQuestions = async (
  currentContent: string,
  userInstruction: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    বর্তমান কন্টেন্ট:
    """
    ${currentContent}
    """
    ব্যবহারকারীর নতুন নির্দেশনা: "${userInstruction}"
    নির্দেশ: উপরের নির্দেশনা অনুযায়ী কন্টেন্টটি সংশোধন বা পরিবর্তন করো। কোনো মার্কডাউন ব্যবহার করবে না।
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return cleanResponse(response.text || '');
  } catch (error) {
    console.error('Error refining:', error);
    throw new Error('সংশোধন করতে সমস্যা হয়েছে।');
  }
};

const cleanResponse = (text: string): string => {
  return text
    .replace(/\*\*/g, '') 
    .replace(/###/g, '')   
    .replace(/##/g, '')    
    .replace(/#/g, '')     
    .replace(/^- /gm, '')
    .trim();
};
