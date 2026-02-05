
import React, { useState, useRef, useEffect } from 'react';
import { QuestionType, QuestionRequest, QuestionConfig, GenerationResult, FilePart, AppMode, SubjectType, ChatMessage, User } from './types';
import { generateQuestionsFromImages, solveAnyQuery } from './services/geminiService';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

const App: React.FC = () => {
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isLoginView, setIsLoginView] = useState(true);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');

  // UI State
  const [appMode, setAppMode] = useState<AppMode>(AppMode.GENERATE);
  const [selectedSubject, setSelectedSubject] = useState<SubjectType>(SubjectType.GENERAL);
  const [uploadedFiles, setUploadedFiles] = useState<FilePart[]>([]);
  const [chatAttachments, setChatAttachments] = useState<FilePart[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [customGenPrompt, setCustomGenPrompt] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<QuestionRequest>({
    [QuestionType.MCQ]: { enabled: false, count: 5 },
    [QuestionType.FILL_IN_BLANKS]: { enabled: false, count: 5 },
    [QuestionType.TRUE_FALSE]: { enabled: false, count: 5 },
    [QuestionType.BRIEF]: { enabled: false, count: 5 },
    [QuestionType.DESCRIPTIVE]: { enabled: false, count: 2 },
    [QuestionType.CREATIVE]: { enabled: false, count: 1 },
  });
  
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [activeChatLog, setActiveChatLog] = useState<ChatMessage[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('সম্পন্ন হয়েছে!');
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialization & Auth
  useEffect(() => {
    const users = JSON.parse(localStorage.getItem('instaq_db_users') || '[]');
    if (!users.find((u: any) => u.email === 'admin@instaq.com')) {
      users.push({
        id: 'admin_root',
        name: 'Super Admin',
        email: 'admin@instaq.com',
        role: 'admin',
        joinedAt: new Date().toISOString(),
        usageCount: 0,
        password: 'admin123'
      });
      localStorage.setItem('instaq_db_users', JSON.stringify(users));
    }

    const savedUser = localStorage.getItem('instaq_user');
    if (savedUser && savedUser !== "null") {
      try {
        const u = JSON.parse(savedUser);
        if (u && u.id) {
          setUser(u);
          if (u.role === 'admin') setAppMode(AppMode.ADMIN);
        }
      } catch (e) {
        console.error("Auth parsing error", e);
      }
    }
  }, []);

  // Sync History
  useEffect(() => {
    if (user?.id) {
      const saved = localStorage.getItem(`instaq_history_${user.id}`);
      if (saved) setHistory(JSON.parse(saved));
    }
  }, [user]);

  useEffect(() => {
    if (user?.id) localStorage.setItem(`instaq_history_${user.id}`, JSON.stringify(history));
  }, [history, user]);

  useEffect(() => {
    if (user?.role === 'admin' && appMode === AppMode.ADMIN) {
      setAllUsers(JSON.parse(localStorage.getItem('instaq_db_users') || '[]'));
    }
  }, [appMode, user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChatLog, loading]);

  // Utility functions
  const triggerToast = (msg: string) => {
    setToastMsg(msg); setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const TypingIndicator = ({ label = "AI টাইপ করছে..." }: { label?: string }) => (
    <div className="flex flex-col items-start animate-entry">
      <div className="bg-indigo-50 rounded-3xl rounded-tl-none p-5 flex items-center gap-4 border border-indigo-100 shadow-sm">
        <div className="typing-dots flex gap-1.5">
          <span className="bg-indigo-400" style={{ animationDelay: '-0.32s' }}></span>
          <span className="bg-indigo-500" style={{ animationDelay: '-0.16s' }}></span>
          <span className="bg-indigo-600"></span>
        </div>
        <span className="text-xs font-black text-indigo-700 uppercase tracking-widest">{label}</span>
      </div>
    </div>
  );

  const SubjectIcon = ({ type }: { type: SubjectType }) => {
    switch (type) {
      case SubjectType.BENGALI: return <i className="fas fa-book"></i>;
      case SubjectType.ENGLISH: return <i className="fas fa-font"></i>;
      case SubjectType.MATH: return <i className="fas fa-divide"></i>;
      case SubjectType.SCIENCE: return <i className="fas fa-atom"></i>;
      case SubjectType.BGS: return <i className="fas fa-landmark"></i>;
      case SubjectType.ISLAM: return <i className="fas fa-kaaba"></i>;
      default: return <i className="fas fa-graduation-cap"></i>;
    }
  };

  // Actions
  const handleAuthAction = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const users = JSON.parse(localStorage.getItem('instaq_db_users') || '[]');
    if (isLoginView) {
      const found = users.find((u: any) => u.email === authForm.email && u.password === authForm.password);
      if (found) {
        const userObj: User = { id: found.id, name: found.name, email: found.email, role: found.role, joinedAt: found.joinedAt, usageCount: found.usageCount };
        setUser(userObj); localStorage.setItem('instaq_user', JSON.stringify(userObj));
        if (userObj.role === 'admin') setAppMode(AppMode.ADMIN); else setAppMode(AppMode.GENERATE);
      } else setAuthError('ইমেইল বা পাসওয়ার্ড ভুল।');
    } else {
      const newUser: User = { id: Date.now().toString(), name: authForm.name, email: authForm.email, role: 'user', joinedAt: new Date().toISOString(), usageCount: 0 };
      users.push({ ...newUser, password: authForm.password });
      localStorage.setItem('instaq_db_users', JSON.stringify(users));
      setUser(newUser); localStorage.setItem('instaq_user', JSON.stringify(newUser));
      setAppMode(AppMode.GENERATE);
    }
  };

  const handleLogout = () => { setUser(null); localStorage.removeItem('instaq_user'); setHistory([]); setResult(null); setActiveChatLog([]); setAppMode(AppMode.GENERATE); };

  const handleMainAction = async () => {
    if (!user || loading) return;
    
    if (appMode === AppMode.GENERATE && uploadedFiles.length === 0) {
      triggerToast('প্রশ্নপত্র তৈরির জন্য ছবি আপলোড প্রয়োজন');
      return;
    }
    if (appMode === AppMode.SEARCH && !userQuery.trim() && uploadedFiles.length === 0) {
      triggerToast('দয়া করে আপনার প্রশ্ন লিখুন অথবা ছবি দিন');
      return;
    }

    setLoading(true);
    try {
      let content = '';
      if (appMode === AppMode.GENERATE) {
        content = await generateQuestionsFromImages(uploadedFiles, selectedTypes, selectedSubject, customGenPrompt, user.id);
      } else if (appMode === AppMode.SEARCH) {
        content = await solveAnyQuery(uploadedFiles, userQuery, selectedSubject, 'SEARCH', user.id);
      }
      
      const newRes: GenerationResult = { 
        id: Date.now().toString(), 
        userId: user.id, 
        content, 
        timestamp: new Date().toISOString(), 
        imageCount: uploadedFiles.length, 
        mode: appMode, 
        subject: selectedSubject, 
        userQuestion: (appMode === AppMode.GENERATE ? customGenPrompt : userQuery) || undefined 
      };
      setResult(newRes); 
      setHistory(prev => [newRes, ...prev]);
      triggerToast('ফলাফল জেনারেট হয়েছে');
    } catch (err: any) { 
      console.error("Generation Error Details:", err);
      triggerToast('জেনারেট করতে সমস্যা হয়েছে: ' + (err.message || 'Unknown Error')); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleChatSolve = async (e?: React.FormEvent, manualQuery?: string) => {
    if (e) e.preventDefault();
    if (!user || loading) return;

    const finalQuery = manualQuery || chatInput;
    if (!finalQuery.trim() && chatAttachments.length === 0) return;
    
    const query = finalQuery; 
    const attachments = [...chatAttachments];
    
    setChatInput(''); 
    setChatAttachments([]);
    setLoading(true);

    const newUserMsg: ChatMessage = { role: 'user', text: query || "[ছবি পাঠানো হয়েছে]", timestamp: new Date().toISOString() };
    const updatedLog = [...activeChatLog, newUserMsg];
    setActiveChatLog(updatedLog);
    
    try {
      const response = await solveAnyQuery(attachments, query || "এই ছবিটি বিশ্লেষণ করো", selectedSubject, 'CHAT', user.id);
      const newAiMsg: ChatMessage = { role: 'ai', text: response, timestamp: new Date().toISOString() };
      const finalLog = [...updatedLog, newAiMsg];
      setActiveChatLog(finalLog);

      if (result && result.mode === AppMode.CHAT) {
        const updatedResult = { ...result, chatLog: finalLog, timestamp: new Date().toISOString() };
        setResult(updatedResult);
        setHistory(prev => prev.map(h => h.id === result.id ? updatedResult : h));
      } else {
        const newChatRes: GenerationResult = {
          id: Date.now().toString(),
          userId: user.id,
          content: response,
          timestamp: new Date().toISOString(),
          imageCount: attachments.length,
          mode: AppMode.CHAT,
          subject: selectedSubject,
          userQuestion: query || undefined,
          chatLog: finalLog
        };
        setResult(newChatRes);
        setHistory(prev => [newChatRes, ...prev]);
      }
    } catch (err: any) { 
      console.error("Chat Error Details:", err);
      triggerToast('AI থেকে উত্তর পেতে সমস্যা হয়েছে'); 
    } finally { 
      setLoading(false); 
    }
  };

  const startNewChat = () => {
    setResult(null);
    setActiveChatLog([]);
    setChatAttachments([]);
    setChatInput('');
    triggerToast('নতুন চ্যাট শুরু হয়েছে');
  };

  const handlePaste = (e: React.ClipboardEvent, target: 'main' | 'chat') => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const part = { data: reader.result as string, mimeType: (file as File).type, name: (file as File).name };
            if (target === 'main') setUploadedFiles(p => [...p, part]);
            else setChatAttachments(p => [...p, part]);
            triggerToast('ছবি পেস্ট করা হয়েছে');
          };
          reader.readAsDataURL(file as File);
        }
      }
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSolve();
    }
  };

  // Improved Unified Export Function - Fixed Black Page Issue
  const exportContent = async (text: string, format: 'copy' | 'pdf' | 'word' | 'image') => {
    if (!text || exporting) return;
    
    if (format === 'copy') {
      try {
        await navigator.clipboard.writeText(text);
        triggerToast('কপি করা হয়েছে');
        return;
      } catch (err) {
        triggerToast('কপি করা সম্ভব হয়নি');
        return;
      }
    }

    setExporting(true);
    triggerToast('ডকুমেন্ট প্রসেসিং হচ্ছে...');

    if (format === 'word') {
      const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body style='font-family: Arial; padding: 40px;'>${text.replace(/\n/g, '<br>')}</body></html>`;
      const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob); 
      link.download = `InstaQ_${Date.now()}.doc`; 
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setExporting(false);
      return;
    }

    const container = document.getElementById('export-container');
    if (container) {
      // Clear and populate
      container.innerText = text;
      
      // Critical: Ensure the container is temporarily visible for capture engines
      // but still hidden from user via opacity and z-index already set in CSS.
      // We also wait a moment for the DOM to update.
      await new Promise(r => setTimeout(r, 1000));
      
      // Ensure fonts are fully ready
      if ((document as any).fonts) await (document as any).fonts.ready;
      
      try {
        // High quality scale for crisp text, with explicit white background
        const dataUrl = await toPng(container, { 
          backgroundColor: '#ffffff', 
          pixelRatio: 2, // 2 is usually enough and more stable
          cacheBust: true,
          style: {
            opacity: '1',
            zIndex: '9999'
          }
        });

        if (!dataUrl || dataUrl === 'data:,') {
          throw new Error("Empty image generated");
        }

        if (format === 'image') {
          const l = document.createElement('a'); 
          l.download = `InstaQ_${Date.now()}.png`; 
          l.href = dataUrl; 
          document.body.appendChild(l);
          l.click();
          document.body.removeChild(l);
        } else {
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const imgProps = pdf.getImageProperties(dataUrl);
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
          
          pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(`InstaQ_${Date.now()}.pdf`);
        }
        triggerToast('ডাউনলোড সম্পন্ন হয়েছে');
      } catch (e) { 
        console.error("Export Error:", e);
        triggerToast('রপ্তানিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।'); 
      } finally { 
        container.innerText = ""; 
        setExporting(false);
      }
    } else {
      setExporting(false);
      triggerToast('এক্সপোর্ট ইঞ্জিন কাজ করছে না');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-[3rem] p-10 shadow-2xl border border-slate-100 animate-entry">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl"><i className="fas fa-brain text-white text-3xl"></i></div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter">InstaQ AI</h1>
            <p className="text-slate-500 font-medium mt-2">আপনার ব্যক্তিগত শিক্ষা সহায়ক</p>
          </div>
          {authError && <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-[11px] font-black border border-red-100">{authError}</div>}
          <form onSubmit={handleAuthAction} className="space-y-4">
            {!isLoginView && <input type="text" required value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 outline-none font-bold" placeholder="আপনার নাম" />}
            <input type="email" required value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 outline-none font-bold" placeholder="ইমেইল এড্রেস" />
            <input type="password" required value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 outline-none font-bold" placeholder="পাসওয়ার্ড" />
            <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-xl hover:bg-indigo-700 transition-all active:scale-95">{isLoginView ? 'প্রবেশ করুন' : 'একাউন্ট খুলুন'}</button>
          </form>
          <div className="mt-8 text-center"><button onClick={() => setIsLoginView(!isLoginView)} className="text-sm font-bold text-slate-400 hover:text-indigo-600 transition-colors">{isLoginView ? 'নতুন একাউন্ট খুলুন' : 'লগইন করুন'}</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fcfcfd]" onPaste={(e) => appMode !== AppMode.CHAT && handlePaste(e, 'main')}>
      {showToast && <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] animate-entry"><div className="bg-slate-900/90 backdrop-blur-md text-white px-8 py-3.5 rounded-full shadow-2xl flex items-center gap-3"><i className="fas fa-check-circle text-emerald-400"></i><span className="text-sm font-bold">{toastMsg}</span></div></div>}

      <nav className="sticky top-0 z-40 glass h-20 px-6 lg:px-12 flex items-center justify-between">
        <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setAppMode(AppMode.GENERATE)}>
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:rotate-12 transition-transform"><i className="fas fa-brain text-white text-xl"></i></div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tighter">InstaQ</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1.5 rounded-3xl mr-4">
            <button onClick={() => setAppMode(AppMode.GENERATE)} className={`px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${[AppMode.GENERATE, AppMode.SEARCH, AppMode.CHAT].includes(appMode) ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>টুলস</button>
            {user?.role === 'admin' && <button onClick={() => setAppMode(AppMode.ADMIN)} className={`px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${appMode === AppMode.ADMIN ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>অ্যাডমিন</button>}
            <button onClick={() => setAppMode(AppMode.PROFILE)} className={`px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${appMode === AppMode.PROFILE ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>প্রোফাইল</button>
          </div>
          <button onClick={() => setShowHistory(true)} className="w-12 h-12 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:shadow-md transition-all"><i className="fas fa-history"></i></button>
          <button onClick={handleLogout} className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"><i className="fas fa-power-off"></i></button>
        </div>
      </nav>

      <main className="flex-grow max-w-[1440px] mx-auto w-full px-6 lg:px-12 py-10">
        {appMode === AppMode.ADMIN ? (
          <div className="space-y-8 animate-entry">
            <h2 className="text-3xl font-black text-slate-800">অ্যাডমিন ড্যাশবোর্ড</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="modern-card p-8 rounded-[2.5rem] text-center">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">মোট ইউজার</div>
                <div className="text-4xl font-black text-indigo-600">{allUsers.length}</div>
              </div>
              <div className="modern-card p-8 rounded-[2.5rem] text-center">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">মোট AI রিকোয়েস্ট</div>
                <div className="text-4xl font-black text-emerald-600">{allUsers.reduce((a,u)=>a+(u.usageCount||0),0)}</div>
              </div>
            </div>
          </div>
        ) : appMode === AppMode.PROFILE ? (
          <div className="max-w-2xl mx-auto py-8 animate-entry">
            <div className="modern-card p-12 rounded-[3.5rem] text-center">
              <div className="w-32 h-32 bg-slate-50 border-4 border-white text-indigo-600 rounded-[3rem] flex items-center justify-center mx-auto mb-8 shadow-xl"><i className="fas fa-user-graduate text-5xl"></i></div>
              <h2 className="text-3xl font-black text-slate-900">{user?.name}</h2>
              <p className="text-slate-400 font-medium mb-10">{user?.email}</p>
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-slate-50 p-6 rounded-3xl">
                  <div className="text-2xl font-black text-indigo-600">{history.length}</div>
                  <div className="text-[10px] font-black uppercase text-slate-400">জেনারেশন</div>
                </div>
                <div className="bg-slate-50 p-6 rounded-3xl">
                  <div className="text-2xl font-black text-emerald-600">{user?.usageCount || 0}</div>
                  <div className="text-[10px] font-black uppercase text-slate-400">ব্যবহৃত ক্রেডিট</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-28">
              <div className="bg-slate-100 p-1.5 rounded-[2.5rem] flex gap-1 shadow-inner">
                {[AppMode.GENERATE, AppMode.SEARCH, AppMode.CHAT].map(m => (
                  <button key={m} onClick={() => setAppMode(m)} className={`flex-1 py-3.5 rounded-[2rem] text-[10px] font-black uppercase tracking-wider transition-all ${appMode === m ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>
                    {m === AppMode.GENERATE ? 'প্রশ্নপত্র' : m === AppMode.SEARCH ? 'সার্চ' : 'চ্যাট'}
                  </button>
                ))}
              </div>

              {appMode === AppMode.CHAT ? (
                <div className="space-y-6 animate-entry">
                  <section className="modern-card p-8 rounded-[2.5rem]">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="font-black text-slate-800 text-xs flex items-center gap-2">
                        <i className="fas fa-history text-indigo-500"></i> চ্যাট হিস্টোরি
                      </h3>
                      <button onClick={startNewChat} className="text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5">
                        <i className="fas fa-plus-circle"></i> নতুন চ্যাট
                      </button>
                    </div>
                    <div className="space-y-3 max-h-[55vh] overflow-y-auto custom-scrollbar pr-2">
                      {history.filter(h => h.mode === AppMode.CHAT).length === 0 ? (
                        <div className="text-center py-10 opacity-30">
                          <i className="fas fa-comment-slash text-3xl mb-3"></i>
                          <p className="text-[10px] font-bold">কোনো চ্যাট হিস্টোরি নেই</p>
                        </div>
                      ) : history.filter(h => h.mode === AppMode.CHAT).map(h => (
                        <button key={h.id} onClick={() => { setResult(h); setActiveChatLog(h.chatLog || []); }} className={`w-full text-left p-4 rounded-2xl border transition-all ${result?.id === h.id ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-transparent hover:bg-white hover:border-slate-100'}`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">{h.subject}</span>
                            <span className="text-[8px] text-slate-400 font-bold">{new Date(h.timestamp).toLocaleDateString('bn-BD')}</span>
                          </div>
                          <p className="text-[11px] font-bold text-slate-700 line-clamp-1">{h.userQuestion || "প্রশ্ন নেই"}</p>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="space-y-6 animate-entry">
                  <section className="modern-card p-8 rounded-[2.5rem]">
                    <h3 className="font-black text-slate-800 text-xs mb-6 flex items-center gap-3"><i className="fas fa-book-open text-indigo-500"></i> বিষয় নির্বাচন</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.values(SubjectType).map(sub => (
                        <button key={sub} onClick={() => setSelectedSubject(sub)} className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[11px] font-bold border-2 transition-all ${selectedSubject === sub ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-slate-50 text-slate-500 border-slate-50 hover:bg-white'}`}>
                          <SubjectIcon type={sub} /> {sub}
                        </button>
                      ))}
                    </div>
                  </section>

                  {appMode === AppMode.GENERATE && (
                    <section className="modern-card p-8 rounded-[2.5rem]">
                      <h3 className="font-black text-slate-800 text-xs mb-6 flex items-center gap-3"><i className="fas fa-list-check text-emerald-500"></i> ধরণ ও সংখ্যা</h3>
                      <div className="space-y-2">
                        {Object.entries(selectedTypes).map(([type, config]) => {
                          const configItem = config as QuestionConfig;
                          return (
                            <div key={type} className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${configItem.enabled ? 'bg-indigo-50/50 border-indigo-100' : 'border-transparent'}`}>
                              <label className="flex items-center gap-3 cursor-pointer group flex-grow">
                                <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${configItem.enabled ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200'}`}>{configItem.enabled && <i className="fas fa-check text-[10px] text-white"></i>}</div>
                                <input type="checkbox" className="hidden" checked={configItem.enabled} onChange={() => setSelectedTypes(prev => ({...prev, [type]: {...configItem, enabled: !configItem.enabled}}))} />
                                <span className={`text-[11px] font-bold ${configItem.enabled ? 'text-indigo-900' : 'text-slate-400'}`}>{type}</span>
                              </label>
                              {configItem.enabled && <input type="number" value={configItem.count} onChange={e => setSelectedTypes(prev => ({...prev, [type]: {...configItem, count: parseInt(e.target.value) || 0}}))} className="w-14 bg-white border border-indigo-100 rounded-xl px-2 py-1.5 text-xs font-black text-indigo-600 text-center outline-none" min="1" max="50" />}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {appMode === AppMode.SEARCH && (
                    <section className="modern-card p-8 rounded-[2.5rem]">
                      <h3 className="font-black text-slate-800 text-xs mb-4">আপনার প্রশ্ন</h3>
                      <textarea value={userQuery} onChange={e => setUserQuery(e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-[2rem] p-6 text-sm font-medium outline-none h-40 focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all placeholder:text-slate-300" placeholder="এখানে আপনার প্রশ্নটি লিখুন..." />
                    </section>
                  )}

                  {appMode === AppMode.GENERATE && (
                    <section className="modern-card p-8 rounded-[2.5rem]">
                      <h3 className="font-black text-slate-800 text-xs mb-4 flex items-center gap-3"><i className="fas fa-comment-dots text-indigo-500"></i> বিশেষ নির্দেশ (কমান্ড)</h3>
                      <textarea 
                        value={customGenPrompt} 
                        onChange={e => setCustomGenPrompt(e.target.value)} 
                        className="w-full bg-slate-50 border border-slate-100 rounded-[2rem] p-6 text-sm font-medium outline-none h-32 focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all placeholder:text-slate-300" 
                        placeholder="যেমন: ৩য় অধ্যায় থেকে প্রশ্ন করুন, অথবা প্রশ্নের মান কঠিন করুন..." 
                      />
                    </section>
                  )}

                  <section className="modern-card p-8 rounded-[2.5rem]">
                    <h3 className="font-black text-slate-800 text-xs mb-4">ছবি আপলোড</h3>
                    <div onClick={() => fileInputRef.current?.click()} className="group border-2 border-dashed border-slate-200 bg-slate-50 rounded-[2rem] p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-white transition-all">
                      <i className="fas fa-camera-retro text-3xl text-slate-300 group-hover:text-indigo-500 transition-colors mb-3"></i>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ক্লিক করুন বা পেস্ট করুন (Ctrl+V)</p>
                    </div>
                    <input type="file" multiple ref={fileInputRef} onChange={e => {
                      const files = e.target.files; if (files) Array.from(files).forEach(f => {
                        const r = new FileReader(); r.onloadend = () => setUploadedFiles(prev => [...prev, { data: r.result as string, mimeType: (f as File).type || 'image/jpeg', name: (f as File).name }]);
                        r.readAsDataURL(f as File);
                      });
                    }} className="hidden" />
                    {uploadedFiles.length > 0 && (
                      <div className="mt-6 flex flex-wrap gap-3">
                        {uploadedFiles.map((f, i) => (
                          <div key={i} className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-white shadow-md relative group">
                            <img src={f.data} className="w-full h-full object-cover" />
                            <button onClick={() => setUploadedFiles(p => p.filter((_, idx)=>idx!==i))} className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-trash-alt"></i></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <button onClick={handleMainAction} disabled={loading} className="w-full py-5 bg-indigo-600 text-white rounded-[2.5rem] font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50">
                    {loading ? <TypingIndicator label="AI প্রসেসিং করছে..." /> : <><i className="fas fa-sparkles"></i> শুরু করুন</>}
                  </button>
                </div>
              )}
            </aside>

            <div className="lg:col-span-8 h-full">
              {appMode === AppMode.CHAT ? (
                <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 flex flex-col h-[calc(100vh-200px)] lg:h-[80vh] overflow-hidden">
                  <header className="px-10 py-8 border-b border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center"><i className="fas fa-robot text-xl"></i></div>
                      <h2 className="font-black text-slate-800">AI টিউটর</h2>
                    </div>
                    {activeChatLog.length > 0 && (
                      <button onClick={startNewChat} className="px-5 py-2.5 bg-slate-50 hover:bg-indigo-50 text-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-slate-100 hover:border-indigo-100 transition-all">
                        ক্লিয়ার চ্যাট
                      </button>
                    )}
                  </header>
                  <div className="flex-grow overflow-y-auto p-10 space-y-8 custom-scrollbar">
                    {activeChatLog.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-20">
                        <i className="fas fa-comments text-5xl mb-6"></i>
                        <h3 className="text-2xl font-black mb-2">চ্যাট শুরু করুন</h3>
                        <p className="text-sm font-medium">আমি প্রতিটি উত্তরের সাথে পৃষ্ঠা ও অনুচ্ছেদ রেফারেন্স দেব।</p>
                      </div>
                    ) : activeChatLog.map((msg, idx) => (
                      <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} group animate-entry`}>
                        <div className={`relative max-w-[85%] p-7 rounded-[2.5rem] text-[15px] font-medium whitespace-pre-wrap leading-relaxed shadow-sm border transition-all ${msg.role === 'user' ? 'bg-indigo-600 text-white border-indigo-600 rounded-tr-none' : 'bg-slate-50 text-slate-800 border-slate-100 rounded-tl-none'}`}>
                          {msg.text}
                          {msg.role === 'ai' && (
                            <div className="absolute -bottom-11 left-0 flex gap-1.5 bg-white border border-slate-100 p-1.5 rounded-2xl shadow-xl opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 z-10">
                              <button onClick={() => exportContent(msg.text, 'copy')} disabled={exporting} title="কপি" className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-xl transition-all"><i className="fas fa-copy"></i></button>
                              <button onClick={() => exportContent(msg.text, 'word')} disabled={exporting} title="Word" className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 text-slate-400 hover:text-blue-600 rounded-xl transition-all"><i className="fas fa-file-word"></i></button>
                              <button onClick={() => exportContent(msg.text, 'pdf')} disabled={exporting} title="PDF" className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 text-slate-400 hover:text-red-500 rounded-xl transition-all"><i className="fas fa-file-pdf"></i></button>
                              <button onClick={() => exportContent(msg.text, 'image')} disabled={exporting} title="ছবি" className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 text-slate-400 hover:text-emerald-500 rounded-xl transition-all"><i className="fas fa-image"></i></button>
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-3 font-black uppercase px-4 tracking-widest">{msg.role === 'user' ? 'আপনি' : 'InstaQ AI'} • {formatTime(msg.timestamp)}</span>
                      </div>
                    ))}
                    {loading && <TypingIndicator label="AI রেফারেন্স সহ উত্তর টাইপ করছে..." />}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="p-10 border-t border-slate-50">
                    {chatAttachments.length > 0 && (
                      <div className="flex gap-3 mb-5 animate-entry">
                        {chatAttachments.map((f, i) => (
                          <div key={i} className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-white shadow-lg relative group">
                            <img src={f.data} className="w-full h-full object-cover"/><button onClick={()=>setChatAttachments(p=>p.filter((_,id)=>id!==i))} className="absolute inset-0 bg-red-600/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-times"></i></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-[2.5rem] border border-slate-100 focus-within:ring-4 focus-within:ring-indigo-100 transition-all">
                        <button type="button" onClick={() => chatFileInputRef.current?.click()} className="w-12 h-12 flex-shrink-0 bg-white text-slate-400 hover:text-indigo-600 rounded-full flex items-center justify-center shadow-sm transition-all self-end mb-1"><i className="fas fa-plus"></i></button>
                        <input type="file" multiple ref={chatFileInputRef} onChange={e => {
                          const files = e.target.files; if (files) Array.from(files).forEach(f => {
                            const r = new FileReader(); r.onloadend = () => setChatAttachments(prev => [...prev, { data: r.result as string, mimeType: (f as File).type || 'image/jpeg', name: (f as File).name }]);
                            r.readAsDataURL(f as File);
                          });
                        }} className="hidden" />
                        <textarea 
                          value={chatInput} 
                          onPaste={(e) => handlePaste(e, 'chat')} 
                          onChange={e => setChatInput(e.target.value)} 
                          onKeyDown={handleChatKeyDown}
                          placeholder="আপনার প্রশ্নটি এখানে লিখুন... (নিচে লাইন নিতে Shift + Enter চাপুন)" 
                          className="flex-grow bg-transparent px-2 py-3 outline-none text-sm font-bold text-slate-700 placeholder:text-slate-300 min-h-[50px] max-h-[150px] resize-none custom-scrollbar" 
                          disabled={loading} 
                        />
                        <button 
                          onClick={(e) => handleChatSolve(e)} 
                          disabled={loading || (!chatInput.trim() && chatAttachments.length === 0)} 
                          className="w-12 h-12 flex-shrink-0 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all self-end mb-1"
                        >
                          {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col min-h-[70vh]">
                  <header className="px-10 py-6 border-b border-slate-50 flex items-center justify-between">
                    <h3 className="font-black text-slate-800 text-sm">ডকুমেন্ট প্রিভিউ (সূত্রসহ)</h3>
                    {result && (
                      <div className="flex gap-2">
                        <button onClick={() => exportContent(result.content, 'copy')} disabled={exporting} title="কপি" className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 hover:text-indigo-600 border border-slate-100 shadow-sm transition-all hover:-translate-y-1"><i className="fas fa-copy"></i></button>
                        <button onClick={() => exportContent(result.content, 'word')} disabled={exporting} title="Word" className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 hover:text-blue-600 border border-slate-100 shadow-sm transition-all hover:-translate-y-1"><i className="fas fa-file-word"></i></button>
                        <button onClick={() => exportContent(result.content, 'pdf')} disabled={exporting} title="PDF" className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 border border-slate-100 shadow-sm transition-all hover:-translate-y-1"><i className="fas fa-file-pdf"></i></button>
                        <button onClick={() => exportContent(result.content, 'image')} disabled={exporting} title="ছবি" className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 hover:text-emerald-500 border border-slate-100 shadow-sm transition-all hover:-translate-y-1"><i className="fas fa-image"></i></button>
                      </div>
                    )}
                  </header>
                  <div className="flex-grow p-12 overflow-y-auto custom-scrollbar">
                    {loading ? (
                      <div className="h-full flex flex-col items-center justify-center space-y-8 animate-pulse">
                        <TypingIndicator label="AI রেফারেন্স খুঁজে বের করছে এবং কন্টেন্ট লিখছে..." />
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">দয়া করে অপেক্ষা করুন</p>
                      </div>
                    ) : result ? (
                      <article className="animate-entry">
                        <div className="mb-10 flex justify-between items-end border-b border-slate-50 pb-8">
                          <div>
                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block mb-2">জেনারেটেড কন্টেন্ট</span>
                            <h2 className="text-4xl font-black text-slate-900 leading-tight">{result.subject}</h2>
                          </div>
                          <div className="px-5 py-2.5 bg-indigo-50 text-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-indigo-100">{result.mode === AppMode.GENERATE ? 'প্রশ্নপত্র' : 'সার্চ'}</div>
                        </div>
                        <div className="text-slate-800 leading-[2.4] text-xl font-medium whitespace-pre-wrap watermarked p-12 rounded-[3rem] border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100">
                          {result.content}
                        </div>
                      </article>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-24">
                        <i className="fas fa-magic text-9xl text-slate-200 mb-10"></i>
                        <h3 className="text-3xl font-black text-slate-900 mb-3">শুরু করতে প্রস্তুত</h3>
                        <p className="text-base font-medium text-slate-500 max-w-sm">বাম পাশের টুল ব্যবহার করে রেফারেন্স সহ জেনারেশন শুরু করুন।</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <div className={`fixed inset-0 z-50 transition-all duration-500 ${showHistory ? 'visible opacity-100' : 'invisible opacity-0'}`}>
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setShowHistory(false)}></div>
        <div className={`absolute inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl transition-transform duration-700 ease-in-out flex flex-col ${showHistory ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-10 border-b border-slate-50 flex items-center justify-between">
            <h2 className="text-3xl font-black text-slate-900">ইতিহাস</h2>
            <button onClick={() => setShowHistory(false)} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-red-500 transition-all"><i className="fas fa-times text-xl"></i></button>
          </div>
          <div className="flex-grow overflow-y-auto p-8 space-y-4 custom-scrollbar">
            {history.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-20"><i className="fas fa-folder-open text-6xl mb-4"></i><p className="text-base font-bold text-slate-400">ইতিহাস ফাঁকা</p></div>
            ) : history.map(h => (
              <button key={h.id} onClick={() => {setResult(h); setAppMode(h.mode); setActiveChatLog(h.chatLog || []); setShowHistory(false);}} className="w-full text-left p-6 rounded-[2.5rem] border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/20 transition-all group">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[9px] font-black uppercase text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg">{h.mode === AppMode.GENERATE ? 'প্রশ্নপত্র' : h.mode === AppMode.SEARCH ? 'সার্চ' : 'চ্যাট'}</span>
                  <span className="text-[10px] text-slate-400 font-bold">{new Date(h.timestamp).toLocaleDateString('bn-BD')}</span>
                </div>
                <p className="text-lg font-black text-slate-800 mb-1 group-hover:text-indigo-700 transition-colors">{h.subject}</p>
                <p className="text-[11px] text-slate-400 font-medium line-clamp-1 italic">{h.content.substring(0, 60)}...</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
