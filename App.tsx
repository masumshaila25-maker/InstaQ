
import React, { useState, useRef, useEffect } from 'react';
import { QuestionType, QuestionRequest, GenerationResult, FilePart, AppMode, QuestionConfig, SubjectType, ChatMessage } from './types';
import { generateQuestionsFromImages, refineQuestions, solveAnyQuery } from './services/geminiService';
import { toPng } from 'html-to-image';

const App: React.FC = () => {
  // Main App State
  const [appMode, setAppMode] = useState<AppMode>(AppMode.GENERATE);
  const [selectedSubject, setSelectedSubject] = useState<SubjectType>(SubjectType.GENERAL);
  const [uploadedFiles, setUploadedFiles] = useState<FilePart[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<QuestionRequest>({
    [QuestionType.MCQ]: { enabled: false, count: 0 },
    [QuestionType.FILL_IN_BLANKS]: { enabled: false, count: 0 },
    [QuestionType.TRUE_FALSE]: { enabled: false, count: 0 },
    [QuestionType.BRIEF]: { enabled: false, count: 0 },
    [QuestionType.DESCRIPTIVE]: { enabled: false, count: 0 },
    [QuestionType.CREATIVE]: { enabled: false, count: 0 },
  });
  
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [activeChatLog, setActiveChatLog] = useState<ChatMessage[]>([]);
  const [showToast, setShowToast] = useState(false);

  // Camera State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const chatMsgRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Load History
  useEffect(() => {
    const savedHistory = localStorage.getItem('instaq_v3_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) { console.error(e); }
    }
  }, []);

  // Save History
  useEffect(() => {
    localStorage.setItem('instaq_v3_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (isCameraOpen && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [isCameraOpen, cameraStream]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChatLog]);

  // Download Helpers
  const downloadTextFile = (text: string, filename: string, mimeType: string) => {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printContent = (text: string, title: string = 'InstaQ Response') => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${title}</title>
            <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;700&display=swap" rel="stylesheet">
            <style>
              body { 
                font-family: 'Hind Siliguri', sans-serif; 
                padding: 40px; 
                line-height: 1.8; 
                color: #1e293b;
              }
              .header { 
                border-bottom: 2px solid #4f46e5; 
                padding-bottom: 15px; 
                margin-bottom: 30px; 
                display: flex;
                justify-content: space-between;
                align-items: center;
              }
              .logo { font-size: 24px; font-weight: 800; color: #4f46e5; }
              .date { font-size: 12px; color: #64748b; }
              .content { white-space: pre-wrap; font-size: 16px; }
              @media print {
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="logo">InstaQ</div>
              <div class="date">${new Date().toLocaleDateString('bn-BD')}</div>
            </div>
            <div class="content">${text}</div>
            <script>
              window.onload = () => {
                window.print();
                // window.close(); // Optional: close tab after print
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const downloadAsImage = async (id: string) => {
    const element = chatMsgRefs.current[id];
    if (element) {
      try {
        const dataUrl = await toPng(element, { 
          backgroundColor: '#ffffff', 
          quality: 1, 
          pixelRatio: 2,
          skipFonts: false,
          filter: (node: any) => {
            if (node.classList && (node.classList.contains('action-buttons-container') || node.tagName === 'BUTTON')) {
              return false;
            }
            return true;
          }
        });
        const link = document.createElement('a');
        link.download = `InstaQ_Export_${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error('Image generation failed', err);
        setError('ছবি হিসেবে সেভ করতে সমস্যা হয়েছে। অনুগ্রহ করে স্ক্রিনশট নিন অথবা পুনরায় চেষ্টা করুন।');
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    }).catch(err => console.error(err));
  };

  // Handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const fileArray = Array.from(files);
      fileArray.forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setUploadedFiles(prev => [...prev, {
            data: reader.result as string,
            mimeType: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
            name: file.name
          }]);
          setError(null);
        };
        reader.readAsDataURL(file);
      });
    }
    if (e.target) e.target.value = '';
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setCameraStream(stream);
      setIsCameraOpen(true);
      setError(null);
    } catch (err) {
      setError("ক্যামেরা ব্যবহারের অনুমতি পাওয়া যায়নি।");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setUploadedFiles(prev => [...prev, {
          data: dataUrl,
          mimeType: 'image/jpeg',
          name: `Scanner_Capture_${Date.now()}.jpg`
        }]);
        stopCamera();
      }
    }
  };

  const stopCamera = () => {
    cameraStream?.getTracks().forEach(track => track.stop());
    setCameraStream(null);
    setIsCameraOpen(false);
  };

  const handleMainAction = async () => {
    if (appMode !== AppMode.CHAT && uploadedFiles.length === 0) {
      setError('অনুগ্রহ করে অন্তত একটি ফাইল আপলোড করুন।');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      let content = '';
      if (appMode === AppMode.GENERATE) {
        const selections = Object.values(selectedTypes) as QuestionConfig[];
        const hasEnabledSelection = selections.some(v => v.enabled);
        if (!hasEnabledSelection) {
          setError('অনুগ্রহ করে অন্তত একটি প্রশ্নের ধরণ নির্বাচন করুন।');
          setLoading(false);
          return;
        }
        content = await generateQuestionsFromImages(uploadedFiles, selectedTypes, selectedSubject);
      } else if (appMode === AppMode.SEARCH) {
        if (!userQuery.trim()) {
          setError('অনুগ্রহ করে আপনার প্রশ্ন বা সমস্যাটি লিখুন।');
          setLoading(false);
          return;
        }
        content = await solveAnyQuery(uploadedFiles, userQuery, selectedSubject, 'SEARCH');
      }

      if (appMode !== AppMode.CHAT) {
        const newResult: GenerationResult = {
          id: Date.now().toString(),
          content,
          timestamp: new Date().toISOString(),
          imageCount: uploadedFiles.length,
          mode: appMode,
          subject: selectedSubject,
          userQuestion: userQuery || undefined
        };
        setResult(newResult);
        setHistory(prev => [newResult, ...prev]);
        setUserQuery('');
      }
    } catch (err: any) {
      setError(err.message || 'অপ্রত্যাশিত কোনো সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const handleChatSolve = async () => {
    if (!chatInput.trim() || loading) return;
    
    const query = chatInput;
    setChatInput('');
    setLoading(true);
    setError(null);
    
    const newUserMsg: ChatMessage = { role: 'user', text: query, timestamp: new Date().toISOString() };
    setActiveChatLog(prev => [...prev, newUserMsg]);

    try {
      const response = await solveAnyQuery(uploadedFiles, query, selectedSubject, 'CHAT');
      const newAiMsg: ChatMessage = { role: 'ai', text: response, timestamp: new Date().toISOString() };
      
      setActiveChatLog(prev => [...prev, newAiMsg]);
      
      if (!result || result.mode !== AppMode.CHAT) {
        const newResult: GenerationResult = {
          id: Date.now().toString(),
          content: response,
          timestamp: new Date().toISOString(),
          imageCount: uploadedFiles.length,
          mode: AppMode.CHAT,
          subject: selectedSubject,
          userQuestion: query,
          chatLog: [newUserMsg, newAiMsg]
        };
        setResult(newResult);
        setHistory(prev => [newResult, ...prev]);
      } else {
        const updatedResult = { ...result, chatLog: [...(result.chatLog || []), newUserMsg, newAiMsg], content: response };
        setResult(updatedResult);
        setHistory(prev => prev.map(h => h.id === result.id ? updatedResult : h));
      }
    } catch (err: any) {
      setError('চ্যাটে উত্তর পেতে সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const handleRefine = async () => {
    if (!chatInput.trim() || !result || refining) return;
    const instruction = chatInput;
    setChatInput('');
    setRefining(true);
    
    try {
      const updatedContent = await refineQuestions(result.content, instruction);
      const updatedResult = { ...result, content: updatedContent };
      setResult(updatedResult);
      setHistory(prev => prev.map(item => item.id === result.id ? updatedResult : item));
    } catch (err: any) {
      setError('সংশোধন করতে সমস্যা হয়েছে।');
    } finally {
      setRefining(false);
    }
  };

  const resetApp = () => {
    setResult(null);
    setActiveChatLog([]);
    setUploadedFiles([]);
    setError(null);
    setUserQuery('');
    setSelectedSubject(SubjectType.GENERAL);
  };

  const getSubjectIcon = (sub: SubjectType) => {
    switch(sub) {
      case SubjectType.BENGALI: return 'fa-pen-nib';
      case SubjectType.ENGLISH: return 'fa-font';
      case SubjectType.MATH: return 'fa-calculator';
      case SubjectType.SCIENCE: return 'fa-flask';
      case SubjectType.BGS: return 'fa-globe';
      case SubjectType.ISLAM: return 'fa-mosque';
      default: return 'fa-book-open';
    }
  };

  const openFile = (file: FilePart) => {
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(`<iframe src="${file.data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fcfcfd]">
      {showToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-entry">
          <div className="bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
            <i className="fas fa-check-circle text-emerald-400"></i>
            <span className="text-sm font-medium">কপি করা হয়েছে!</span>
          </div>
        </div>
      )}

      {isCameraOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-fade-in">
          <div className="flex-grow flex items-center justify-center relative">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
            <button onClick={stopCamera} className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-md border border-white/20 transition-all"><i className="fas fa-times"></i></button>
          </div>
          <div className="bg-slate-900/90 py-8 flex items-center justify-center">
            <button onClick={capturePhoto} className="w-20 h-20 rounded-full bg-white border-[6px] border-slate-300 shadow-xl active:scale-95 transition-all" />
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* Header */}
      <nav className="sticky top-0 z-40 glass border-b border-slate-100 px-4 md:px-8 h-16 md:h-20 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={resetApp}>
          <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 group-hover:scale-105 transition-transform"><i className="fas fa-brain text-white text-lg"></i></div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight tracking-tighter">InstaQ</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHistory(true)} className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 relative transition-all active:scale-95 shadow-sm">
            <i className="fas fa-history"></i>
            {history.length > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">{history.length}</span>}
          </button>
        </div>
      </nav>

      {/* History Drawer */}
      <div className={`fixed inset-0 z-50 transition-all ${showHistory ? 'visible' : 'invisible'}`}>
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
        <div className={`absolute inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl transition-transform duration-500 ${showHistory ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex flex-col h-full p-6">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold">ইতিহাস</h2>
              <button onClick={() => setShowHistory(false)} className="w-10 h-10 rounded-full hover:bg-slate-100"><i className="fas fa-times"></i></button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-4 no-scrollbar">
              {history.length === 0 ? <p className="text-center text-slate-400 py-20">কোনো ইতিহাস নেই</p> : history.map(item => (
                <button key={item.id} onClick={() => {setResult(item); setAppMode(item.mode); if(item.chatLog) setActiveChatLog(item.chatLog); setShowHistory(false);}} className="w-full text-left p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group">
                  <div className="flex justify-between items-center mb-2">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${item.mode === AppMode.GENERATE ? 'bg-indigo-100 text-indigo-600' : item.mode === AppMode.CHAT ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'}`}>
                      {item.mode === AppMode.GENERATE ? 'প্রশ্নপত্র' : item.mode === AppMode.CHAT ? 'জিজ্ঞাসা' : 'অনুসন্ধান'}
                    </span>
                    <span className="text-[10px] text-slate-400">{new Date(item.timestamp).toLocaleDateString('bn-BD')}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-700 line-clamp-2">{item.mode !== AppMode.GENERATE ? (item.userQuestion || item.content.substring(0, 100)) : item.content.substring(0, 100)}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <main className="flex-grow max-w-[1400px] mx-auto w-full px-4 md:px-8 py-6 md:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Side: Controls */}
        <div className={`lg:col-span-4 space-y-6 ${result && appMode !== AppMode.CHAT ? 'hidden lg:block' : 'block animate-entry'}`}>
          
          <div className="bg-slate-100 p-1.5 rounded-[2rem] flex flex-wrap items-center shadow-inner gap-1">
            <button onClick={() => {setAppMode(AppMode.GENERATE); setError(null);}} className={`flex-1 py-3 px-1 rounded-[1.75rem] text-[10px] sm:text-xs font-black transition-all ${appMode === AppMode.GENERATE ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}><i className="fas fa-file-invoice mr-1.5"></i>প্রশ্নপত্র</button>
            <button onClick={() => {setAppMode(AppMode.SEARCH); setError(null);}} className={`flex-1 py-3 px-1 rounded-[1.75rem] text-[10px] sm:text-xs font-black transition-all ${appMode === AppMode.SEARCH ? 'bg-white text-emerald-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}><i className="fas fa-search mr-1.5"></i>উত্তর খুঁজুন</button>
            <button onClick={() => {setAppMode(AppMode.CHAT); setError(null); setResult(null); setActiveChatLog([]);}} className={`flex-1 py-3 px-1 rounded-[1.75rem] text-[10px] sm:text-xs font-black transition-all ${appMode === AppMode.CHAT ? 'bg-white text-violet-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}><i className="fas fa-comments-alt mr-1.5"></i>জিজ্ঞাসা ও সমাধান</button>
          </div>

          {appMode !== AppMode.CHAT && (
            <>
              <section className="bg-white rounded-[2rem] p-6 md:p-8 paper-card animate-entry">
                <div className="flex items-center gap-3 mb-6"><div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-sm"><i className="fas fa-tags"></i></div><h3 className="font-bold text-lg">বিষয় নির্বাচন করুন</h3></div>
                <div className="grid grid-cols-3 gap-2">
                    {Object.values(SubjectType).map(sub => (
                      <button 
                        key={sub}
                        onClick={() => setSelectedSubject(sub)}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${selectedSubject === sub ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-105' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
                      >
                        <i className={`fas ${getSubjectIcon(sub)} mb-2 text-sm`}></i>
                        <span className="text-[10px] font-bold">{sub}</span>
                      </button>
                    ))}
                </div>
              </section>

              <section className="bg-white rounded-[2rem] p-6 md:p-8 paper-card animate-entry">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3"><div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-sm"><i className="fas fa-book"></i></div><h3 className="font-bold text-lg">বইয়ের পাতা আপলোড</h3></div>
                  <button onClick={startCamera} className="w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all"><i className="fas fa-camera text-sm"></i></button>
                </div>
                <div onClick={() => fileInputRef.current?.click()} className="group border-2 border-dashed border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all">
                  <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-3 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all group-hover:scale-110"><i className="fas fa-plus text-xl"></i></div>
                  <p className="font-bold text-slate-600 text-sm text-center">ছবি বা PDF আপলোড করুন</p>
                </div>
                <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} accept="image/*,.pdf" className="hidden" />
                {uploadedFiles.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 animate-entry">
                    {uploadedFiles.map((file, i) => (
                      <div key={i} className="relative group w-12 h-12 rounded-xl overflow-hidden border border-slate-100 shadow-sm cursor-pointer" onClick={() => openFile(file)}>
                        {file.mimeType.includes('pdf') ? <div className="w-full h-full bg-slate-50 flex items-center justify-center text-red-500 text-xs"><i className="fas fa-file-pdf"></i></div> : <img src={file.data} className="w-full h-full object-cover" />}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <i className="fas fa-eye text-white text-xs"></i>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setUploadedFiles(prev => prev.filter((_, idx) => idx !== i)); }} className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-bl-lg opacity-0 group-hover:opacity-100 transition-opacity text-[8px]"><i className="fas fa-trash-alt"></i></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="bg-white rounded-[2rem] p-6 md:p-8 paper-card animate-entry">
                {appMode === AppMode.GENERATE ? (
                  <div>
                    <div className="flex items-center gap-3 mb-6"><div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-sm"><i className="fas fa-list-ul"></i></div><h3 className="font-bold text-lg">প্রশ্নের ধরণ ও সংখ্যা</h3></div>
                    <div className="grid grid-cols-1 gap-2">
                      {Object.values(QuestionType).map(type => (
                        <div key={type} className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${selectedTypes[type].enabled ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-100'}`}>
                          <button onClick={() => setSelectedTypes(prev => ({...prev, [type]: {...prev[type], enabled: !prev[type].enabled}}))} className="flex items-center gap-3 flex-grow text-left">
                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${selectedTypes[type].enabled ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'}`}>{selectedTypes[type].enabled && <i className="fas fa-check text-[10px]"></i>}</div>
                            <span className="text-xs font-semibold">{type}</span>
                          </button>
                          {selectedTypes[type].enabled && (
                            <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border border-indigo-100">
                              <button onClick={() => setSelectedTypes(prev => ({...prev, [type]: {...prev[type], count: Math.max(0, prev[type].count - 1)}}))} className="w-5 h-5 text-slate-400 hover:text-indigo-600 transition-colors"><i className="fas fa-minus text-[8px]"></i></button>
                              <input type="number" value={selectedTypes[type].count} onChange={(e) => { const val = parseInt(e.target.value); setSelectedTypes(prev => ({...prev, [type]: {...prev[type], count: isNaN(val) ? 0 : val}})); }} className="w-8 text-center text-xs font-bold text-indigo-700 bg-transparent outline-none" />
                              <button onClick={() => setSelectedTypes(prev => ({...prev, [type]: {...prev[type], count: prev[type].count + 1}}))} className="w-5 h-5 text-slate-400 hover:text-indigo-600 transition-colors"><i className="fas fa-plus text-[8px]"></i></button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-3 mb-6"><div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-sm"><i className="fas fa-search"></i></div><h3 className="font-bold text-lg">বই থেকে উত্তর খুঁজুন</h3></div>
                    <textarea value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="বই থেকে কি জানতে চান লিখুন..." className="w-full h-32 p-4 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all text-sm resize-none shadow-inner" />
                  </div>
                )}
              </section>

              <button onClick={handleMainAction} disabled={loading} className={`w-full py-5 rounded-[2rem] font-black text-lg text-white shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95 ${loading ? 'bg-slate-300 cursor-not-allowed' : (appMode === AppMode.GENERATE ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700')}`}>
                {loading ? <i className="fas fa-circle-notch fa-spin"></i> : <i className={appMode === AppMode.GENERATE ? "fas fa-sparkles" : "fas fa-search"}></i>} 
                {loading ? 'প্রসেস হচ্ছে...' : (appMode === AppMode.GENERATE ? 'প্রশ্নপত্র তৈরি করুন' : 'উত্তর খুঁজুন')}
              </button>
            </>
          )}

          {appMode === AppMode.CHAT && (
            <div className="bg-violet-50/50 p-6 rounded-[2rem] border border-violet-100 animate-entry hidden lg:block">
               <h3 className="text-violet-700 font-bold mb-2 flex items-center gap-2"><i className="fas fa-info-circle"></i> চ্যাট টিপস</h3>
               <p className="text-[11px] text-violet-600 leading-relaxed font-medium">এখানে আপনি যেকোনো গাণিতিক সমাধান, বাংলা ব্যাকরণ বা ইংরেজি গ্রামার নিয়ে প্রশ্ন করতে পারেন। AI প্রতিটি উত্তরের সাথে ডাউনলোড অপশনও প্রদান করবে।</p>
            </div>
          )}

          {error && <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100 animate-shake flex items-center gap-2 mt-4"><i className="fas fa-exclamation-triangle"></i>{error}</div>}
        </div>

        {/* Right Side: Result Display */}
        <div className={`lg:col-span-8 flex flex-col h-full min-h-[600px] ${!result && !loading && appMode !== AppMode.CHAT ? 'hidden lg:block' : 'flex animate-entry'}`}>
          {loading && !activeChatLog.length && appMode !== AppMode.CHAT ? (
            <div className="flex-grow bg-white rounded-[3rem] paper-card flex flex-col items-center justify-center p-12 text-center">
              <div className={`w-24 h-24 border-4 border-slate-100 ${appMode === AppMode.GENERATE ? 'border-t-indigo-600' : 'border-t-emerald-600'} rounded-full animate-spin relative mb-8 flex items-center justify-center`}><i className={`fas ${appMode === AppMode.GENERATE ? 'fa-robot text-indigo-600' : 'fa-brain text-emerald-600'} text-2xl`}></i></div>
              <h3 className="text-2xl font-black text-slate-800 animate-pulse">AI আপনার জন্য কাজ করছে...</h3>
              <p className="text-slate-500 mt-4 max-w-xs leading-relaxed font-medium">কয়েক সেকেন্ড অপেক্ষা করুন। ম্যাজিক শুরু হতে যাচ্ছে।</p>
            </div>
          ) : (appMode === AppMode.CHAT || result) ? (
            <div className="flex-grow flex flex-col bg-white rounded-[3rem] paper-card overflow-hidden relative shadow-2xl h-full">
              
              {/* Tool bar for Results */}
              {result && appMode !== AppMode.CHAT && (
                <div className="px-6 md:px-10 py-5 bg-white/80 backdrop-blur-md border-b flex items-center justify-between sticky top-0 z-30">
                  <div className="flex items-center gap-4">
                    <button onClick={() => { setResult(null); }} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors"><i className="fas fa-arrow-left"></i></button>
                    <div className="hidden sm:block">
                      <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${appMode === AppMode.GENERATE ? 'bg-indigo-500' : 'bg-emerald-500'}`}></span>
                        {appMode === AppMode.GENERATE ? `${result.subject || 'সাধারণ'} প্রশ্নপত্র` : 'অনুসন্ধান ফলাফল'}
                      </h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => copyToClipboard(result.content)} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-colors"><i className="fas fa-copy text-slate-600"></i></button>
                    <button onClick={() => printContent(result.content, result.mode === AppMode.GENERATE ? 'InstaQ Question Paper' : 'InstaQ Search Result')} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black shadow-lg hover:bg-black transition-all">প্রিন্ট / PDF</button>
                  </div>
                </div>
              )}

              {/* Chat Content Area */}
              <div ref={contentAreaRef} className={`flex-grow overflow-y-auto custom-scrollbar p-6 md:p-10 flex flex-col ${appMode === AppMode.CHAT && activeChatLog.length === 0 ? 'justify-center items-center' : ''}`}>
                {appMode === AppMode.CHAT ? (
                  activeChatLog.length === 0 ? (
                    <div className="text-center max-w-lg animate-entry">
                        <div className="w-24 h-24 bg-violet-600 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-violet-200 rotate-3">
                           <i className="fas fa-comments-alt text-4xl"></i>
                        </div>
                        <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tighter">জিজ্ঞাসা ও সমাধান</h2>
                        <p className="text-slate-500 font-medium mb-12 leading-relaxed">গণিত সমাধান, গ্রামার ব্যাখ্যা বা যেকোনো একাডেমিক সমস্যার সমাধানের জন্য প্রশ্ন লিখুন। প্রতিটি উত্তরের জন্য স্বতন্ত্র ডাউনলোড অপশন পাবেন।</p>
                    </div>
                  ) : (
                    <div className="flex flex-col space-y-8 max-w-3xl mx-auto w-full">
                      {activeChatLog.map((msg, idx) => {
                        const msgId = `chat-msg-${idx}`;
                        return (
                          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-entry`}>
                            <div 
                              ref={el => { chatMsgRefs.current[msgId] = el; }}
                              className={`max-w-[85%] px-6 py-5 rounded-[2rem] shadow-sm relative watermarked ${msg.role === 'user' ? 'bg-violet-600 text-white rounded-tr-none shadow-violet-100' : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none shadow-slate-100'}`}
                            >
                              <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap font-medium">{msg.text}</p>
                              
                              {/* AI Response Action Buttons */}
                              {msg.role === 'ai' && (
                                <div className="mt-4 pt-3 border-t border-slate-50 flex items-center gap-3 action-buttons-container">
                                  <button onClick={() => copyToClipboard(msg.text)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="কপি করুন"><i className="fas fa-copy text-[10px]"></i></button>
                                  <button onClick={() => downloadTextFile(msg.text, `Response_${idx}.doc`, 'application/msword')} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Word ডাউনলোড"><i className="fas fa-file-word text-[10px]"></i></button>
                                  <button onClick={() => printContent(msg.text)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all" title="PDF হিসেবে সেভ"><i className="fas fa-file-pdf text-[10px]"></i></button>
                                  <button onClick={() => downloadAsImage(msgId)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all" title="Image ডাউনলোড"><i className="fas fa-image text-[10px]"></i></button>
                                </div>
                              )}
                            </div>
                            <span className="text-[9px] text-slate-400 mt-2 font-bold uppercase tracking-wider mx-4">{msg.role === 'user' ? 'আপনি' : 'AI Assistant'} • {new Date(msg.timestamp).toLocaleTimeString('bn-BD')}</span>
                          </div>
                        );
                      })}
                      {loading && (
                        <div className="flex items-start animate-pulse">
                          <div className="bg-white border border-slate-100 px-6 py-4 rounded-[2rem] rounded-tl-none flex items-center gap-2">
                            <div className="flex gap-1"><div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:0.2s]"></div><div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:0.4s]"></div></div>
                            <span className="text-xs font-bold text-slate-400"></span>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )
                ) : (
                  result && (
                    <div className="max-w-3xl mx-auto w-full space-y-8 animate-entry">
                      {result.userQuestion && (
                        <div className="bg-emerald-50/50 border-l-4 border-emerald-500 p-6 rounded-r-3xl shadow-sm">
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-2">আপনার জিজ্ঞাসা</span>
                          <p className="text-xl font-bold text-slate-800 leading-relaxed">{result.userQuestion}</p>
                        </div>
                      )}
                      <div className="bg-white p-8 md:p-16 shadow-xl rounded-[2.5rem] border border-slate-100 relative group min-h-[400px] watermarked">
                          <div className="text-slate-800 text-base md:text-lg leading-[2.2] whitespace-pre-wrap font-medium selection:bg-indigo-100">
                            {result.content}
                          </div>
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* Input Area */}
              <div className={`bg-white border-t px-6 py-6 transition-all ${appMode === AppMode.CHAT && activeChatLog.length === 0 ? 'border-t-0 pb-20' : ''}`}>
                <div className="max-w-3xl mx-auto flex flex-col relative">
                  {refining && <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-4 py-1.5 rounded-full text-[10px] font-bold animate-bounce shadow-lg">AI সংশোধন করছে...</div>}
                  <div className="relative group">
                    <textarea 
                      rows={1}
                      value={chatInput} 
                      onChange={(e) => setChatInput(e.target.value)} 
                      onKeyDown={(e) => { 
                        if (e.key === 'Enter' && !e.shiftKey) { 
                          e.preventDefault(); 
                          appMode === AppMode.CHAT ? handleChatSolve() : handleRefine(); 
                        } 
                      }}
                      placeholder={appMode === AppMode.CHAT ? "এখানে যেকোনো প্রশ্ন লিখুন..." : "সংশোধন করতে এখানে লিখুন..."} 
                      className={`w-full bg-slate-50 border border-slate-100 rounded-[2.5rem] py-5 pl-8 pr-16 text-sm md:text-base font-bold shadow-xl shadow-slate-100/30 outline-none focus:ring-8 focus:ring-violet-500/5 transition-all resize-none overflow-hidden min-h-[60px] max-h-[150px]`}
                      style={{ height: 'auto' }}
                      onInput={(e) => {
                         const target = e.target as HTMLTextAreaElement;
                         target.style.height = 'auto';
                         target.style.height = `${Math.min(target.scrollHeight, 150)}px`;
                      }}
                    />
                    <button 
                      onClick={appMode === AppMode.CHAT ? handleChatSolve : handleRefine} 
                      disabled={!chatInput.trim() || loading || refining}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center text-white shadow-xl active:scale-90 transition-all ${appMode === AppMode.CHAT ? 'bg-violet-600 hover:bg-violet-700 shadow-violet-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'} disabled:opacity-50`}
                    >
                      <i className={`fas ${loading || refining ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center p-12 text-center bg-white rounded-[3rem] paper-card border-4 border-dashed border-slate-100 hover:bg-slate-50/50 transition-all">
              <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center mb-10 shadow-2xl relative">
                <div className={`absolute inset-0 ${appMode === AppMode.GENERATE ? 'bg-indigo-500/10' : 'bg-emerald-500/10'} rounded-full animate-ping`}></div>
                <i className={`fas ${appMode === AppMode.GENERATE ? 'fa-file-circle-plus' : 'fa-search-plus'} text-5xl ${appMode === AppMode.GENERATE ? 'text-indigo-400' : 'text-emerald-400'} relative z-10`}></i>
              </div>
              <h3 className="text-3xl font-black text-slate-800 tracking-tight">সহায়ক AI প্রস্তুত</h3>
              <p className="text-slate-500 mt-6 max-w-sm mx-auto leading-relaxed font-medium">বামদিকের প্যানেল থেকে মোড এবং বিষয় নির্বাচন করুন। এরপর আপনার ফাইল আপলোড করে প্রশ্নপত্র তৈরি বা অনুসন্ধান করুন।</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
