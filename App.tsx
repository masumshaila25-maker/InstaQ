
import React, { useState, useRef, useEffect } from 'react';
import { QuestionType, QuestionRequest, GenerationResult, FilePart } from './types';
import { generateQuestionsFromImages, refineQuestions } from './services/geminiService';

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

const App: React.FC = () => {
  // Main App State
  const [uploadedFiles, setUploadedFiles] = useState<FilePart[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<QuestionRequest>({
    [QuestionType.MCQ]: { enabled: false, count: 5 },
    [QuestionType.FILL_IN_BLANKS]: { enabled: false, count: 5 },
    [QuestionType.TRUE_FALSE]: { enabled: false, count: 5 },
    [QuestionType.BRIEF]: { enabled: false, count: 5 },
    [QuestionType.DESCRIPTIVE]: { enabled: false, count: 3 },
  });
  
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [showToast, setShowToast] = useState(false);

  // Camera State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load History from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('instaq_history_v2');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) { console.error(e); }
    }
  }, []);

  // Save History to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('instaq_history_v2', JSON.stringify(history));
  }, [history]);

  // Effect to attach stream when video element is rendered
  useEffect(() => {
    if (isCameraOpen && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [isCameraOpen, cameraStream]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  // File Handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const fileArray = Array.from(files);
      fileArray.forEach(file => {
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

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearHistory = () => {
    if (window.confirm('আপনি কি নিশ্চিত যে সব ইতিহাস মুছে ফেলতে চান?')) {
      setHistory([]);
      localStorage.removeItem('instaq_history_v2');
    }
  };

  // Camera Handlers
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }, 
        audio: false 
      });
      setCameraStream(stream);
      setIsCameraOpen(true);
      setError(null);
    } catch (err) {
      console.error("Camera access error:", err);
      setError("ক্যামেরা ব্যবহারের অনুমতি পাওয়া যায়নি। অনুগ্রহ করে ব্রাউজার সেটিংস চেক করুন।");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraOpen(false);
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
        setError(null);
      }
    }
  };

  // AI Actions
  const handleGenerate = async () => {
    if (uploadedFiles.length === 0) {
      setError('অনুগ্রহ করে অন্তত একটি ফাইল আপলোড করুন।');
      return;
    }
    const hasSelection = Object.values(selectedTypes).some(v => v.enabled);
    if (!hasSelection) {
      setError('অনুগ্রহ করে অন্তত একটি প্রশ্নের ধরণ নির্বাচন করুন।');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setChatLog([]); // Reset chat for new generation
    try {
      const content = await generateQuestionsFromImages(uploadedFiles, selectedTypes);
      const newResult: GenerationResult = {
        id: Date.now().toString(),
        content,
        timestamp: new Date().toISOString(),
        imageCount: uploadedFiles.length
      };
      setResult(newResult);
      setHistory(prev => [newResult, ...prev]);
      setChatLog([{ role: 'ai', text: 'আপনার প্রশ্নপত্র তৈরি হয়েছে! কোনো সংশোধন প্রয়োজন হলে নিচে চ্যাট করুন।' }]);
    } catch (err: any) {
      setError(err.message || 'অপ্রত্যাশিত কোনো সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const handleRefine = async () => {
    if (!chatInput.trim() || !result) return;
    const instruction = chatInput;
    setChatInput('');
    setRefining(true);
    setChatLog(prev => [...prev, { role: 'user', text: instruction }]);
    
    try {
      const updatedContent = await refineQuestions(result.content, instruction);
      const updatedResult = { ...result, content: updatedContent };
      setResult(updatedResult);
      setChatLog(prev => [...prev, { role: 'ai', text: 'আপনার অনুরোধ অনুযায়ী প্রশ্নপত্রটি সংশোধন করা হয়েছে।' }]);
      setHistory(prev => prev.map(item => item.id === result.id ? updatedResult : item));
    } catch (err: any) {
      setChatLog(prev => [...prev, { role: 'ai', text: 'দুঃখিত, সংশোধন করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।' }]);
    } finally {
      setRefining(false);
    }
  };

  // Utils
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    });
  };

  const downloadAsWord = (data: GenerationResult) => {
    const content = data.content.replace(/\n/g, '<br/>');
    const header = `<html><head><meta charset='utf-8'></head><body style="font-family: 'Hind Siliguri', Arial; line-height: 1.6; padding: 40px;">${content}</body></html>`;
    const blob = new Blob(['\ufeff', header], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `InstaQ_${Date.now()}.doc`;
    link.click();
  };

  const downloadAsPdf = (data: GenerationResult) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const content = data.content.replace(/\n/g, '<br/>');
      printWindow.document.write(`
        <html>
          <head>
            <title>InstaQ Question Paper</title>
            <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;700&display=swap" rel="stylesheet">
            <style>
              body { 
                font-family: 'Hind Siliguri', sans-serif; 
                padding: 50px; 
                line-height: 1.8;
                color: #1a1a1a;
              }
              .content { max-width: 800px; margin: 0 auto; }
              @media print {
                body { padding: 20px; }
                @page { margin: 2cm; }
              }
            </style>
          </head>
          <body>
            <div class="content">${content}</div>
            <script>
              window.onload = function() {
                window.print();
                // window.close(); // Uncomment if you want the tab to close automatically after print
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fcfcfd]">
      {/* Toast */}
      {showToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-entry">
          <div className="bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
            <i className="fas fa-check-circle text-emerald-400"></i>
            <span className="text-sm font-medium">কপি করা হয়েছে!</span>
          </div>
        </div>
      )}

      {/* Camera Overlay */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-fade-in">
          <div className="flex-grow flex items-center justify-center relative">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
            <button onClick={stopCamera} className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-md border border-white/20">
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>
          <div className="bg-slate-900/90 py-8 flex items-center justify-center border-t border-white/5">
            <button onClick={capturePhoto} className="w-20 h-20 rounded-full bg-white border-[6px] border-slate-300 shadow-[0_0_30px_rgba(255,255,255,0.2)]" />
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* Header */}
      <nav className="sticky top-0 z-40 glass border-b border-slate-100 px-4 md:px-8 h-16 md:h-20 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => {setResult(null); setChatLog([]);}}>
          <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 group-hover:scale-105 transition-transform">
            <i className="fas fa-brain text-white text-lg"></i>
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900">InstaQ</h1>
            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest leading-none">AI Question Generator</p>
          </div>
        </div>
        <button onClick={() => setShowHistory(true)} className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 relative">
          <i className="fas fa-history"></i>
          {history.length > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">{history.length}</span>}
        </button>
      </nav>

      {/* History Drawer */}
      <div className={`fixed inset-0 z-50 transition-all ${showHistory ? 'visible' : 'invisible'}`}>
        <div className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-500 ${showHistory ? 'opacity-100' : 'opacity-0'}`} onClick={() => setShowHistory(false)}></div>
        <div className={`absolute inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl transition-transform duration-500 ease-in-out ${showHistory ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex flex-col h-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">পুরোনো প্রশ্নপত্র</h2>
              <button onClick={() => setShowHistory(false)} className="w-10 h-10 rounded-full hover:bg-slate-100 transition-colors"><i className="fas fa-times"></i></button>
            </div>
            
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">সংরক্ষিত প্রশ্নপত্রসমূহ</span>
                {history.length > 0 && (
                    <button onClick={clearHistory} className="text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1">
                        <i className="fas fa-trash-alt text-[10px]"></i> সব মুছে ফেলুন
                    </button>
                )}
            </div>

            <div className="flex-grow overflow-y-auto space-y-3 no-scrollbar pb-10">
              {history.length === 0 ? (
                <div className="text-center py-20 text-slate-300">
                    <i className="fas fa-history text-5xl mb-4 opacity-20"></i>
                    <p className="text-sm font-medium">কোনো ইতিহাস পাওয়া যায়নি</p>
                </div>
              ) : (
                history.map(item => (
                    <button key={item.id} onClick={() => {setResult(item); setChatLog([{role: 'ai', text: 'ইতিহাস থেকে ফাইল লোড করা হয়েছে।'}]); setShowHistory(false);}} className="w-full text-left p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all group">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{new Date(item.timestamp).toLocaleDateString('bn-BD')}</span>
                        <i className="fas fa-chevron-right text-[10px] text-slate-300 group-hover:text-indigo-400 transition-colors"></i>
                      </div>
                      <p className="text-sm font-semibold text-slate-700 line-clamp-2 leading-relaxed">{item.content.substring(0, 100)}...</p>
                    </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="flex-grow max-w-[1400px] mx-auto w-full px-4 md:px-8 py-6 md:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column */}
        <div className={`lg:col-span-4 space-y-6 ${result ? 'hidden lg:block' : 'block'}`}>
          <section className="bg-white rounded-[2rem] p-6 md:p-8 paper-card">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3"><div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-sm"><i className="fas fa-cloud-upload-alt"></i></div><h3 className="font-bold text-lg">ফাইল আপলোড</h3></div>
              <button onClick={startCamera} className="w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"><i className="fas fa-camera text-sm"></i></button>
            </div>
            <div onClick={() => fileInputRef.current?.click()} className="group border-2 border-dashed border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50">
              <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all"><i className="fas fa-plus text-2xl"></i></div>
              <p className="font-bold text-slate-600 group-hover:text-indigo-600">ছবি বা PDF যোগ করুন</p>
            </div>
            <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} accept="image/*,.pdf" className="hidden" />
            {uploadedFiles.length > 0 && (
              <div className="mt-6 grid grid-cols-4 gap-2">
                {uploadedFiles.map((file, i) => (
                  <div key={i} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-100 shadow-sm">
                    {file.mimeType.includes('pdf') ? <div className="w-full h-full bg-slate-50 flex items-center justify-center text-red-500"><i className="fas fa-file-pdf text-xl"></i></div> : <img src={file.data} className="w-full h-full object-cover" />}
                    <button onClick={() => removeFile(i)} className="absolute inset-0 bg-red-500/80 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"><i className="fas fa-trash-alt"></i></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white rounded-[2rem] p-6 md:p-8 paper-card">
            <div className="flex items-center gap-3 mb-6"><div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-sm"><i className="fas fa-list-check"></i></div><h3 className="font-bold text-lg">প্রশ্নের ধরণ</h3></div>
            <div className="space-y-2">
              {Object.values(QuestionType).map(type => (
                <div key={type} className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${selectedTypes[type].enabled ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-100'}`}>
                  <button onClick={() => setSelectedTypes(prev => ({...prev, [type]: {...prev[type], enabled: !prev[type].enabled}}))} className="flex items-center gap-3 flex-grow text-left">
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${selectedTypes[type].enabled ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'}`}>{selectedTypes[type].enabled && <i className="fas fa-check text-[10px]"></i>}</div>
                    <span className="text-sm font-semibold">{type}</span>
                  </button>
                  {selectedTypes[type].enabled && (
                    <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border border-indigo-100">
                      <button onClick={() => setSelectedTypes(prev => ({...prev, [type]: {...prev[type], count: Math.max(1, prev[type].count - 1)}}))} className="w-6 h-6 text-slate-400"><i className="fas fa-minus text-[10px]"></i></button>
                      <span className="w-8 text-center text-sm font-bold text-indigo-700">{selectedTypes[type].count}</span>
                      <button onClick={() => setSelectedTypes(prev => ({...prev, [type]: {...prev[type], count: prev[type].count + 1}}))} className="w-6 h-6 text-slate-400"><i className="fas fa-plus text-[10px]"></i></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {error && <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100"><i className="fas fa-exclamation-triangle mr-2"></i>{error}</div>}

          <button onClick={handleGenerate} disabled={loading} className={`w-full py-5 rounded-[2rem] font-black text-lg text-white shadow-xl flex items-center justify-center gap-3 transition-all ${loading ? 'bg-slate-300' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}>
            {loading ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-sparkles"></i>} প্রশ্নপত্র তৈরি করুন
          </button>
        </div>

        {/* Result Column */}
        <div className={`lg:col-span-8 flex flex-col h-full min-h-[600px] ${!result && !loading ? 'hidden lg:flex' : 'flex'}`}>
          {loading ? (
            <div className="flex-grow bg-white rounded-[3rem] paper-card flex flex-col items-center justify-center p-12 text-center">
              <div className="w-24 h-24 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin relative mb-8"><i className="fas fa-robot text-indigo-600 text-2xl absolute inset-0 flex items-center justify-center animate-pulse"></i></div>
              <h3 className="text-2xl font-black text-slate-800">AI বিশ্লেষণ করছে...</h3>
              <p className="text-slate-500 mt-4 max-w-xs leading-relaxed">বইয়ের পাতাগুলো থেকে সেরা প্রশ্নগুলো তৈরি করা হচ্ছে।</p>
            </div>
          ) : result ? (
            <div className="flex-grow flex flex-col bg-white rounded-[3rem] paper-card overflow-hidden relative">
              {/* Toolbar */}
              <div className="px-6 md:px-10 py-5 bg-slate-50/50 backdrop-blur-md border-b flex items-center justify-between sticky top-0 z-30">
                <button onClick={() => setResult(null)} className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200"><i className="fas fa-chevron-left"></i></button>
                <div className="hidden sm:block"><h3 className="font-black text-slate-800 text-sm">প্রশ্নপত্র প্রস্তুত!</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(result.timestamp).toLocaleTimeString('bn-BD')}</p></div>
                <div className="flex items-center gap-2">
                  <button onClick={() => downloadAsWord(result)} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-100 hover:bg-blue-700 transition-colors">Word</button>
                  <button onClick={() => downloadAsPdf(result)} className="px-4 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-100 hover:bg-rose-700 transition-colors">PDF</button>
                  <button onClick={() => copyToClipboard(result.content)} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"><i className="fas fa-copy"></i></button>
                </div>
              </div>

              {/* Paper Content */}
              <div ref={contentAreaRef} className="flex-grow p-6 md:p-16 overflow-y-auto bg-[radial-gradient(#f1f5f9_1px,transparent_1px)] [background-size:32px_32px] custom-scrollbar h-[400px]">
                {refining && <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center"><i className="fas fa-spinner fa-spin text-indigo-600 text-4xl mb-4"></i><p className="text-indigo-700 font-bold">সংশোধন হচ্ছে...</p></div>}
                <div className="max-w-3xl mx-auto bg-white p-8 md:p-20 shadow-xl rounded-lg border border-slate-100 min-h-full">
                  <div className="text-slate-800 text-base md:text-lg leading-[2] whitespace-pre-wrap font-medium">{result.content}</div>
                </div>
              </div>

              {/* Chat Interface */}
              <div className="bg-slate-50 border-t px-6 py-6">
                <div className="max-w-2xl mx-auto flex flex-col h-64">
                   {/* Chat History */}
                   <div className="flex-grow overflow-y-auto mb-4 space-y-3 pr-2 custom-scrollbar">
                      {chatLog.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm font-medium ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'}`}>
                            {msg.text}
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                   </div>

                   {/* Input Field */}
                   <div className="relative">
                      <input 
                        type="text" 
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                        placeholder="প্রশ্নটি সংশোধন করতে নির্দেশ দিন..."
                        className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-6 pr-14 text-sm font-medium shadow-sm focus:ring-4 focus:ring-indigo-500/10 outline-none"
                      />
                      <button 
                        onClick={handleRefine}
                        disabled={!chatInput.trim() || refining}
                        className="absolute right-2 top-2 bottom-2 w-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-md active:scale-90 disabled:bg-slate-200"
                      >
                        <i className={`fas ${refining ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
                      </button>
                   </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center p-12 text-center bg-white rounded-[3rem] paper-card border-4 border-dashed border-slate-100">
              <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-10 shadow-inner"><i className="fas fa-file-circle-plus text-5xl text-slate-200"></i></div>
              <h3 className="text-3xl font-black text-slate-800">এখনো কোনো প্রশ্নপত্র নেই</h3>
              <p className="text-slate-500 mt-5 italic">ফাইল আপলোড করে শুরু করুন।</p>
            </div>
          )}
        </div>
      </main>

      <footer className="px-6 py-8 border-t border-slate-100 text-center">
        <p className="text-[11px] font-black text-slate-800 bg-white px-6 py-2 rounded-full inline-block shadow-sm border border-slate-100">Developed by Masum Sir &copy; 2026</p>
      </footer>
    </div>
  );
};

export default App;
