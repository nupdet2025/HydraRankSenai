import React, { useState, useEffect } from 'react';
import {
  Droplet,
  CupSoda,
  GlassWater,
  Trophy,
  Calendar,
  User,
  Plus,
  Trash2,
  LogOut,
  Edit3,
  Beer,
  Sparkles,
  Clock,
  ArrowRight,
  Search,
  RefreshCw,
  TrendingUp,
  Check,
  AlertCircle,
  Award
} from 'lucide-react';
import { UserProfile, WaterLog, RankingItem, RankingPeriod } from './types';
import WaterCircle from './components/WaterCircle';
import {
  getUserByEmail,
  saveUser,
  addWaterLog,
  deleteWaterLog,
  getUserLogs,
  deleteUserProfile,
  getAllUsers,
  getDailySummaryByDate,
  getPeriodSummary,
  isSupabaseActive,
  getSupabaseConfig,
  saveCustomSupabaseConfig
} from './database';

// Preset hydration limits
const DAILY_GOAL_DEFAULT = 2500; // in ml

const AVATAR_OPTIONS = [
  // Goticulas e Copos
  { char: '💧', label: 'Gota de Água' },
  { char: '🥤', label: 'Copo com Canudo' },
  { char: '🥛', label: 'Copo de Água' },
  { char: '🚰', label: 'Torneira' },
  { char: '🧊', label: 'Cubo de Gelo' },
  { char: '🧉', label: 'Cuia' },
  // Animais Aquáticos
  { char: '🐬', label: 'Golfinho' },
  { char: '🐳', label: 'Baleia' },
  { char: '🐧', label: 'Pinguim' },
  { char: '🦦', label: 'Lontra' },
  { char: '🐸', label: 'Sapo' },
  { char: '🐙', label: 'Polvo' },
  { char: '🐢', label: 'Tartaruga' },
  { char: '🐠', label: 'Peixe' },
  // Sobreviventes da Seca
  { char: '🌵', label: 'Cacto' },
  { char: '🐪', label: 'Camelo' },
  { char: '🍉', label: 'Melancia' },
  // Esportistas & Zen
  { char: '🏄‍♂️', label: 'Surfista' },
  { char: '🏊‍♂️', label: 'Nadador' },
  { char: '🧘', label: 'Meditação' },
  // Divinatários / Diversos
  { char: '👑', label: 'Rei da Água' },
  { char: '🦸‍♂️', label: 'Super Heroi' },
  { char: '🦖', label: 'Dinossauro' },
  { char: '👽', label: 'Alien Hidratado' },
  { char: '✨', label: 'Brilho' }
];

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
  id: number;
}

export default function App() {
  // ---- AUTH & SESSION STATE ----
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('water_token'));
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem('water_email'));
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // ---- DATABASE & SUPABASE CONNECTION CONFIG ----
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [dbConfig, setDbConfig] = useState(() => getSupabaseConfig());
  const [supaUrlInput, setSupaUrlInput] = useState(() => dbConfig.url);
  const [supaKeyInput, setSupaKeyInput] = useState(() => dbConfig.key);

  const handleSaveDbConfig = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      saveCustomSupabaseConfig(supaUrlInput, supaKeyInput);
      const conf = getSupabaseConfig();
      setDbConfig(conf);
      showToast('Configurações do Supabase salvas com sucesso! Redirecionando conexões...', 'success');
      setShowConfigPanel(false);
      // Hot refresh rankings & logs
      fetchRankings();
      if (token) {
        fetchSessionProfile();
        fetchLogs();
      }
    } catch (err: any) {
      showToast(`Erro ao salvar configurações: ${err.message}`, 'error');
    }
  };

  const handleClearDbConfig = () => {
    saveCustomSupabaseConfig('', '');
    const conf = getSupabaseConfig();
    setDbConfig(conf);
    setSupaUrlInput('');
    setSupaKeyInput('');
    showToast('Modo de banco local (offline) ativado para este navegador.', 'info');
    setShowConfigPanel(false);
    fetchRankings();
    if (token) {
      fetchSessionProfile();
      fetchLogs();
    }
  };
  
  // ---- AUTH INTERACTION ----
  const [authEmailInput, setAuthEmailInput] = useState('');
  const [authCodeInput, setAuthCodeInput] = useState('');
  const [isCodeRequested, setIsCodeRequested] = useState(false);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // ---- PROFILE SETUP FORM ----
  const [setupUsername, setSetupUsername] = useState('');
  const [setupAvatar, setSetupAvatar] = useState('💧');
  const [profileSaving, setProfileSaving] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // ---- WATER LOG STATE ----
  const [waterAmountInput, setWaterAmountInput] = useState<number | ''>('');
  const [selectedQuickAdd, setSelectedQuickAdd] = useState<number | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logs, setLogs] = useState<WaterLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ---- RANKING STATE ----
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [period, setPeriod] = useState<RankingPeriod>('today');
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingSearch, setRankingSearch] = useState('');

  // ---- GENERAL UI STATES ----
  const [activeTab, setActiveTab] = useState<'consumo' | 'ranking'>('consumo');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [goal, setGoal] = useState<number>(() => {
    const saved = localStorage.getItem('water_goal');
    return saved ? parseInt(saved, 10) : DAILY_GOAL_DEFAULT;
  });
  const [isCustomGoalOpen, setIsCustomGoalOpen] = useState(false);
  const [customGoalInput, setCustomGoalInput] = useState<number | string>(goal);
  const [selectedLogDate, setSelectedLogDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Fetch current user and metadata on token changes
  useEffect(() => {
    if (token) {
      localStorage.setItem('water_token', token);
      fetchSessionProfile();
      fetchLogs();
    } else {
      localStorage.removeItem('water_token');
      localStorage.removeItem('water_email');
      setProfile(null);
      setLogs([]);
    }
  }, [token]);

  useEffect(() => {
    if (email) {
      localStorage.setItem('water_email', email);
    }
  }, [email]);

  // Fetch rankings
  useEffect(() => {
    fetchRankings();
    
    // Auto-refresh rankings every 30 seconds to keep competitive spirit alive!
    const timer = setInterval(() => {
      fetchRankings(true);
    }, 30000);

    return () => clearInterval(timer);
  }, [period, selectedLogDate]);

  // Helper to trigger inline beautifully animated toast notifications
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { message, type, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  // ---- API ACTIONS ----

  // Fetch verified profile
  const fetchSessionProfile = async () => {
    if (!token) return;
    try {
      const user = await getUserByEmail(token);
      if (user) {
        setProfile(user);
        setSetupUsername(user.username);
        setSetupAvatar(user.avatar);
      } else {
        // Logged in but profile was not created yet
        setProfile(null);
      }
    } catch (error) {
      showToast('Erro ao carregar perfil.', 'error');
    }
  };

  // Fetch historical water logs of current user
  const fetchLogs = async () => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const userLogs = await getUserLogs(token);
      const sorted = userLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setLogs(sorted);
    } catch (error) {
      console.error(error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Fetch public rankings list
  const fetchRankings = async (silent = false) => {
    if (!silent) setRankingLoading(true);
    try {
      const users = await getAllUsers();
      let summary: Record<string, number> = {};

      if (period === 'today') {
        summary = await getDailySummaryByDate(selectedLogDate);
      } else if (period === 'week') {
        const targetDate = new Date(selectedLogDate);
        const startDateObj = new Date(targetDate);
        startDateObj.setDate(targetDate.getDate() - 6);
        const startDate = startDateObj.toISOString().split('T')[0];
        summary = await getPeriodSummary(startDate, selectedLogDate);
      } else if (period === 'month') {
        const targetDate = new Date(selectedLogDate);
        const startDateObj = new Date(targetDate);
        startDateObj.setDate(targetDate.getDate() - 29);
        const startDate = startDateObj.toISOString().split('T')[0];
        summary = await getPeriodSummary(startDate, selectedLogDate);
      } else {
        summary = await getPeriodSummary('1970-01-01', '9999-12-31');
      }

      const rankingList = Object.entries(users).map(([email, userProfile]) => {
        const totalAmount = summary[email] || 0;
        return {
          email: userProfile.email,
          username: userProfile.username,
          avatar: userProfile.avatar,
          totalAmount,
        };
      });

      const activeRankers = rankingList.filter((item) => item.username);

      activeRankers.sort((a, b) => {
        if (b.totalAmount !== a.totalAmount) {
          return b.totalAmount - a.totalAmount;
        }
        return a.username.localeCompare(b.username);
      });

      setRanking(activeRankers);
    } catch (error) {
      console.error(error);
      if (!silent) showToast('Erro ao atualizar ranking coletivo.', 'error');
    } finally {
      if (!silent) setRankingLoading(false);
    }
  };

  // Handle direct 1-step passwordless login (extremely simple & perfect for friends!)
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmailInput || !authEmailInput.includes('@')) {
      showToast('Por favor, insira um e-mail válido.', 'error');
      return;
    }

    const cleanEmail = authEmailInput.toLowerCase().trim();
    setAuthLoading(true);
    try {
      const user = await getUserByEmail(cleanEmail);
      setEmail(cleanEmail);
      setToken(cleanEmail); // Set email as token directly!
      if (user) {
        setProfile(user);
        setSetupUsername(user.username);
        setSetupAvatar(user.avatar);
        showToast(`Bem-vindo de volta, ${user.username}! 🥛`, 'success');
      } else {
        setProfile(null);
        setSetupUsername('');
        setSetupAvatar('💧');
        showToast('Nenhum perfil encontrado para este e-mail. Vamos criar um agora!', 'info');
      }
    } catch (error: any) {
      showToast(error.message || 'Erro ao realizar login.', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  // No-op fallback since we bypass 2-step verification for simplified client usage
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
  };

  // Update Profile details (name and avatar emoji sticker)
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupUsername || setupUsername.trim().length === 0) {
      showToast('Por favor, informe seu nome de usuário.', 'error');
      return;
    }

    setProfileSaving(true);
    try {
      const updated = await saveUser({
        email: email || token!,
        username: setupUsername.trim(),
        avatar: setupAvatar,
        createdAt: profile?.createdAt || new Date().toISOString()
      });
      setProfile(updated);
      showToast('Perfil atualizado com sucesso!', 'success');
      setIsEditingProfile(false);
      fetchRankings();
    } catch (error: any) {
      showToast(error.message || 'Erro ao atualizar perfil.', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  // Save new Water Log to database
  const handleLogWater = async (e?: React.FormEvent, customAmount?: number) => {
    if (e) e.preventDefault();
    
    const ml = customAmount || Number(waterAmountInput);
    if (!ml || ml <= 0) {
      showToast('Informe uma quantidade de água válida em ml.', 'error');
      return;
    }

    setLogLoading(true);
    try {
      await addWaterLog(email || token!, selectedLogDate, ml);
      showToast(`Registrado: ${ml}ml de água! 🥛`, 'success');
      setWaterAmountInput('');
      setSelectedQuickAdd(null);
      fetchLogs();
      fetchRankings();
    } catch (error: any) {
      showToast(error.message || 'Erro ao registrar consumo.', 'error');
    } finally {
      setLogLoading(false);
    }
  };

  // Quick Action presets clicking
  const handleQuickAddClick = (amount: number) => {
    setSelectedQuickAdd(amount);
    handleLogWater(undefined, amount);
  };

  // Delete water log record
  const handleDeleteLog = async (logId: string) => {
    if (!confirm('Deseja excluir este registro de hidratação?')) return;
    try {
      const success = await deleteWaterLog(logId, email || token!);
      if (success) {
        showToast('Registro de água removido.', 'info');
        fetchLogs();
        fetchRankings();
      } else {
        showToast('Erro ao remover registro.', 'error');
      }
    } catch (error: any) {
      showToast(error.message || 'Erro na conexão.', 'error');
    }
  };

  const handleUpdateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedGoal = typeof customGoalInput === 'string' ? parseInt(customGoalInput, 10) : customGoalInput;
    if (isNaN(parsedGoal) || parsedGoal <= 0) {
      showToast('A meta deve ser um número maior que zero.', 'error');
      return;
    }
    setGoal(parsedGoal);
    localStorage.setItem('water_goal', parsedGoal.toString());
    showToast(`Meta diária definida para ${parsedGoal}ml! 🎯`, 'success');
    setIsCustomGoalOpen(false);
  };

  // Handle safe logout
  const handleLogout = async () => {
    setToken(null);
    setEmail(null);
    setProfile(null);
    setLogs([]);
    setActiveTab('consumo');
    showToast('Até logo! Mantenha-se hidratado!', 'info');
  };

  // Delete current user profile and matching logs/sessions
  const handleDeleteProfile = async () => {
    if (!confirm('ATENÇÃO DO JOGADOR: Você tem certeza absoluta que deseja apagar o seu perfil? Isso apagará definitivamente todos os seus registros de água, seu nick, seu histórico e te removerá do ranking.')) return;

    try {
      const success = await deleteUserProfile(email || token!);
      if (success) {
        showToast('Perfil excluído com sucesso!', 'success');
        setToken(null);
        setEmail(null);
        setProfile(null);
        setLogs([]);
        setActiveTab('consumo');
        setIsEditingProfile(false);
      } else {
        showToast('Erro ao deletar perfil.', 'error');
      }
    } catch (error: any) {
      showToast(error.message || 'Erro de conexão ao deletar perfil.', 'error');
    }
  };

  // ---- CALCULATIONS ----
  const usersTodayLogs = logs.filter(l => l.date === selectedLogDate);
  const totalWaterLoggedToday = usersTodayLogs.reduce((sum, item) => sum + item.amount, 0);
  const percentCompleteToday = Math.round((totalWaterLoggedToday / goal) * 100);

  const activeRankingWithMyPosition = ranking.map((item, index) => ({
    ...item,
    rank: index + 1
  }));

  const myRankItem = activeRankingWithMyPosition.find(item => item.email.toLowerCase() === email?.toLowerCase());

  const podium1st = activeRankingWithMyPosition[0] || null;
  const podium2nd = activeRankingWithMyPosition[1] || null;
  const podium3rd = activeRankingWithMyPosition[2] || null;
  const listParticipants = activeRankingWithMyPosition.slice(3);

  const filteredListParticipants = listParticipants.filter(item => 
    item.username.toLowerCase().includes(rankingSearch.toLowerCase()) ||
    item.email.toLowerCase().includes(rankingSearch.toLowerCase())
  );

  // Dynamic system streak logic
  const calculateStreak = () => {
    if (logs.length === 0) return 0;
    const dates = Array.from(new Set(logs.map(l => l.date))).sort();
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    const hasToday = dates.includes(todayStr);
    const hasYesterday = dates.includes(yesterdayStr);
    
    if (!hasToday && !hasYesterday) return 0;
    
    let currentStreak = 0;
    const lastDate = hasToday ? new Date() : new Date(Date.now() - 86400000);
    while (true) {
      const dateStr = lastDate.toISOString().split('T')[0];
      if (dates.includes(dateStr)) {
        currentStreak++;
        lastDate.setDate(lastDate.getDate() - 1);
      } else {
        break;
      }
    }
    return currentStreak;
  };

  const streak = calculateStreak();

  return (
    <div className="min-h-screen bg-[#020617] text-[#f8fafc] flex flex-col antialiased font-sans" id="main-applet-wrapper">
      
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full font-sans pointer-events-none" id="toasts-portal">
        {toasts.map((t) => (
          <div
            key={t.id}
            id={`toast-${t.id}`}
            className={`pointer-events-auto p-4 rounded-xl shadow-lg border text-xs flex items-start gap-3 transition-transform duration-350 bg-slate-900 ${
              t.type === 'success'
                ? 'border-emerald-500/30 text-emerald-400'
                : t.type === 'error'
                ? 'border-rose-500/30 text-rose-400'
                : 'border-cyan-500/30 text-cyan-400'
            }`}
          >
            {t.type === 'success' && <Check className="w-4 h-4 text-emerald-400 shrink-0 font-bold" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 font-bold" />}
            {t.type === 'info' && <Droplet className="w-4 h-4 text-cyan-400 shrink-0 font-bold" />}
            <span className="flex-1 font-medium leading-tight">{t.message}</span>
          </div>
        ))}
      </div>

      {/* MINIMALIST HEADER */}
      <header className="bg-[#030712]/90 backdrop-blur-md border-b border-cyan-500/10 sticky top-0 z-40 px-6 py-4 flex items-center justify-between" id="app-header">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center">
            <Droplet className="w-4.5 h-4.5 text-cyan-400 fill-cyan-405" />
          </div>
          <span className="text-lg font-black tracking-tight text-white font-display">HydraRank</span>
          
          <div className="hidden sm:flex items-center gap-1 ml-8 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setActiveTab('consumo');
                setIsEditingProfile(false);
              }}
              className={`text-xs px-4 py-2 font-semibold flex items-center gap-1.5 transition-all cursor-pointer rounded-lg ${
                activeTab === 'consumo'
                  ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Consumo
            </button>
            <button
              onClick={() => {
                setActiveTab('ranking');
                setIsEditingProfile(false);
              }}
              className={`text-xs px-4 py-2 flex items-center gap-1.5 font-semibold transition-all cursor-pointer rounded-lg ${
                activeTab === 'ranking'
                  ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ranking
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="sm:hidden flex items-center gap-0.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => { setActiveTab('consumo'); setIsEditingProfile(false); }}
              className={`text-xs px-2.5 py-1.5 rounded-md font-semibold transition-all ${activeTab === 'consumo' ? 'bg-cyan-500 text-white shadow-xs font-bold' : 'text-slate-400'}`}
            >
              Consumo
            </button>
            <button
              onClick={() => { setActiveTab('ranking'); setIsEditingProfile(false); }}
              className={`text-xs px-2.5 py-1.5 rounded-md font-semibold transition-all ${activeTab === 'ranking' ? 'bg-cyan-500 text-white shadow-xs font-bold' : 'text-slate-400'}`}
            >
              Ranking
            </button>
          </div>

          {profile ? (
            <div className="flex items-center gap-2 bg-slate-950/80 py-1 pl-3 pr-1 rounded-full border border-slate-800" id="user-header-tab">
              <span className="text-sm w-7 h-7 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-full" role="img" aria-label={profile.username}>
                {profile.avatar}
              </span>
              <span className="text-xs font-bold text-slate-200 hidden sm:inline truncate max-w-28">{profile.username}</span>
              
              <button
                onClick={() => setIsEditingProfile(true)}
                className="p-1 px-1.5 hover:bg-slate-900 text-slate-450 hover:text-cyan-400 transition-colors rounded-lg cursor-pointer"
                title="Editar Perfil"
              >
                <Edit3 className="w-3 h-3" />
              </button>
              <button
                onClick={handleLogout}
                className="p-1 px-1.5 hover:bg-rose-950/30 text-slate-450 hover:text-rose-400 transition-colors rounded-lg cursor-pointer"
                title="Sair"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
          ) : token ? (
            <div className="animate-pulse bg-slate-900 border border-slate-800 rounded-full h-8 w-24"></div>
          ) : (
            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider bg-cyan-950/40 border border-cyan-800/30 px-3 py-1.5 rounded-xl">
              • Visualização
            </span>
          )}
        </div>
      </header>

      {/* VIEWPORT CONTENT */}
      <main className="flex-grow max-w-6xl mx-auto w-full p-4 lg:p-6" id="app-main-content">
         {!token && (
          <div className="max-w-md mx-auto my-12 bg-slate-950/80 p-8 rounded-[24px] border border-cyan-500/20 shadow-glow-cyan relative overflow-hidden" id="auth-panel-card">
            <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 text-cyan-500/10 pointer-events-none">
              <Droplet className="w-36 h-36 fill-current" />
            </div>
            
            <div className="text-center mb-6">
              <span className="text-[10px] uppercase tracking-widest font-extrabold text-cyan-400 bg-cyan-950/45 px-3 py-1.5 border border-cyan-800/40 rounded-full">
                💧 HydraRank
              </span>
              <h2 className="font-display font-black text-2xl uppercase tracking-tight text-white mt-4">Participe do Placar</h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Insira seu e-mail para registrar seu consumo diário e competir de forma saudável de hidratação com seus amigos!
              </p>
            </div>

            <form onSubmit={handleRequestCode} className="space-y-4" id="request-code-form">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Seu E-mail
                </label>
                <input
                  type="email"
                  value={authEmailInput}
                  onChange={(e) => setAuthEmailInput(e.target.value)}
                  placeholder="ex: amigo@email.com"
                  required
                  className="w-full text-xs bg-slate-900 border border-slate-800 text-white px-4 py-3.5 rounded-xl placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 focus:bg-slate-950 transition-all font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-cyan-600 hover:bg-cyan-550 text-white font-extrabold py-3.5 rounded-xl transition-all shadow-[0_4px_12px_rgba(6,182,212,0.15)] cursor-pointer text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:bg-slate-900 disabled:text-slate-600 font-bold"
              >
                {authLoading ? 'Verificando...' : 'Entrar na HydraRank'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* PROFILE SETUP FORM / LOADING */}
        {token && (!profile || isEditingProfile) && (
          <div className="max-w-lg mx-auto bg-slate-950/80 p-8 rounded-[24px] border border-cyan-500/20 shadow-glow-cyan" id="profile-setup-card">
            <div className="mb-6">
              <span className="text-[10px] font-extrabold text-cyan-400 bg-cyan-950/45 px-3 py-1.5 border border-cyan-800/40 rounded-full">
                {isEditingProfile ? '✏️ Atualizar Identidade' : '👋 Seja bem-vindo à equipe!'}
              </span>
              <h2 className="font-display font-black text-2xl uppercase tracking-tight text-white mt-4">
                {isEditingProfile ? 'Ajustar Identidade' : 'Configure seu Perfil'}
              </h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Seu nickname de usuário e uma figurinha (emoji) representam você no ranking geral de hidratação.
              </p>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 mb-2">
                  Nickname / Nome de Exibição
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={setupUsername}
                  onChange={(e) => setSetupUsername(e.target.value)}
                  placeholder="Ex: Pedro.Dev ou Amanda"
                  required
                  className="w-full text-xs bg-slate-900 border border-slate-800 text-white px-4 py-3.5 rounded-xl focus:outline-none focus:border-cyan-500 focus:bg-slate-950 transition-all font-semibold font-sans font-medium"
                />
                <p className="text-[9px] text-slate-500 mt-1.5 font-mono">Máximo de 20 caracteres.</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 mb-2">
                  Sua Figurinha (Avatar)
                </label>
                <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto p-2.5 border border-slate-800 rounded-xl bg-slate-900" id="avatar-grid-picker">
                  {AVATAR_OPTIONS.map((opt) => (
                    <button
                      key={opt.char}
                      type="button"
                      onClick={() => setSetupAvatar(opt.char)}
                      title={opt.label}
                      className={`w-11 h-11 text-xl flex items-center justify-center rounded-xl transition-all cursor-pointer border ${
                        setupAvatar === opt.char
                          ? 'bg-cyan-950 border-cyan-500 scale-105 text-white shadow-glow-cyan'
                          : 'bg-slate-950 hover:bg-slate-900 border-slate-800 text-slate-350'
                      }`}
                    >
                      {opt.char}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900/50 p-4 border border-slate-800 rounded-xl flex items-center gap-4">
                <span className="text-3xl w-14 h-14 flex items-center justify-center bg-slate-950 border border-slate-800 rounded-xl shadow-inner">{setupAvatar}</span>
                <div className="text-left font-sans">
                  <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest leading-none">Amostra do Placar</p>
                  <p className="text-sm font-bold text-slate-200 leading-tight truncate mt-1.5">{setupUsername || 'Seu apelido...'}</p>
                </div>
              </div>

              <div className="flex gap-3">
                {isEditingProfile && (
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="flex-1 text-[10px] font-bold py-3.5 text-slate-400 bg-transparent hover:bg-slate-900 border border-slate-800 rounded-xl transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-550 text-white font-extrabold py-3.5 rounded-xl text-[10px] uppercase tracking-wider transition-all shadow-[0_4px_12px_rgba(6,182,212,0.15)] cursor-pointer"
                >
                  {profileSaving ? 'Salvando...' : 'Salvar Perfil'}
                </button>
              </div>

              {isEditingProfile && (
                <div className="pt-4 border-t border-slate-800/60 flex flex-col gap-2">
                  <p className="text-[10px] text-slate-500 font-mono text-center">
                    Zona de Perigo
                  </p>
                  <button
                    type="button"
                    onClick={handleDeleteProfile}
                    className="w-full flex items-center justify-center gap-2 border border-rose-500/30 hover:bg-rose-500/10 hover:border-rose-500/50 text-rose-405 font-bold py-3 px-4 rounded-xl transition-all cursor-pointer text-[10px] uppercase tracking-wider"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    Apagar Perfil Definitivamente
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        {/* MAIN USER PANEL VIEW */}
        {token && profile && !isEditingProfile && (
          <div>
            
            {/* TAB-1: CONSUMO VIEW (Beautiful layout matching the original blueprint but cleanly designed) */}
            {activeTab === 'consumo' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch" id="view-consumo-tab">
                
                {/* 1. MINHA HIDRATAÇÃO CARD (Left column) */}
                <div className="lg:col-span-4 bg-slate-950/80 p-6 rounded-[24px] border border-cyan-500/20 shadow-glow-cyan flex flex-col justify-between" id="hydration-hydration-card">
                  
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display font-bold text-base text-white uppercase tracking-wide">Minha Hidratação</h2>
                    
                    {/* Fire Badge metrics */}
                    <div className="bg-orange-950/50 text-orange-400 px-3 py-1 rounded-full border border-orange-900/60 flex items-center gap-1 text-xs font-bold shadow-xs">
                      <span>🔥</span>
                      <span>{streak} {streak === 1 ? 'dia' : 'dias'}</span>
                    </div>
                  </div>

                  {/* High Quality SVG-rendered water gauge circle */}
                  <div className="relative w-48 mx-auto my-4">
                    <WaterCircle 
                      percentage={percentCompleteToday} 
                      totalMl={totalWaterLoggedToday} 
                      goalMl={goal} 
                    />
                  </div>

                  {/* Metric stats strip at the bottom */}
                  <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4 mt-auto">
                    <div className="text-left font-sans">
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Bebido</p>
                      <p className="text-lg font-black text-cyan-400 mt-1 font-sans">{totalWaterLoggedToday} ml</p>
                    </div>
                    
                    <div className="text-left border-l border-slate-800 pl-4 relative font-sans">
                                    {isCustomGoalOpen ? (
                          <form onSubmit={handleUpdateGoal} className="flex items-center gap-1 z-10 absolute left-2 -top-1 bg-slate-900 p-2 rounded-lg shadow-lg border border-slate-800">
                            <input
                              type="number"
                              value={customGoalInput}
                              onChange={(e) => setCustomGoalInput(e.target.value)}
                              className="w-16 text-xs font-mono font-bold bg-slate-950 border border-slate-800 rounded px-1.5 py-1 text-white focus:outline-none"
                            />
                            <button type="submit" className="text-emerald-500 hover:text-emerald-450 font-bold text-xs px-1 font-sans">✓</button>
                            <button type="button" onClick={() => setIsCustomGoalOpen(false)} className="text-slate-400 hover:text-slate-200 font-bold text-xs px-1 font-sans">✕</button>
                          </form>
                        ) : (
                          <>
                            <span className="text-base font-black text-slate-200 font-sans">{goal} ml</span>
                            <button
                              onClick={() => {
                                setCustomGoalInput(goal);
                                setIsCustomGoalOpen(true);
                              }}
                              className="p-1 hover:bg-slate-900 text-slate-450 hover:text-cyan-400 rounded transition-colors cursor-pointer"
                              title="Ajustar Meta"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                {/* 2. ADICIONAR ÁGUA CARD (Middle column) */}
                <div className="lg:col-span-5 bg-slate-950/80 p-6 rounded-[24px] border border-cyan-500/20 shadow-glow-cyan flex flex-col justify-between" id="hydration-presets-card">
                  
                  <div>
                    <h2 className="font-display font-bold text-base text-white mb-4 uppercase tracking-wide">Adicionar Água</h2>
                    
                    {/* Presets Grid */}
                    <div className="grid grid-cols-2 gap-3" id="hydration-shortcut-presets">
                      {[
                        { amount: 250, label: 'Copo', icon: '💧' },
                        { amount: 350, label: 'Copo Grande', icon: '🥤' },
                        { amount: 500, label: 'Garrafa', icon: '🍼' },
                        { amount: 1000, label: 'Garrafa Grande', icon: '🏺' }
                      ].map((item) => (
                        <button
                          key={item.amount}
                          type="button"
                          disabled={logLoading}
                          onClick={() => handleQuickAddClick(item.amount)}
                          className="bg-slate-900/40 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-500/50 p-4 rounded-xl transition-all flex flex-col items-center justify-center text-center cursor-pointer group shadow-2xs"
                        >
                          <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">{item.icon}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{item.label}</span>
                          <span className="text-sm font-extrabold text-cyan-400 font-mono mt-1">+{item.amount} ml</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Customized logging field */}
                  <div className="space-y-4 pt-4 mt-4 border-t border-slate-800">
                    <div className="flex gap-2.5">
                      <div className="relative flex-grow">
                        <input
                          type="number"
                          value={waterAmountInput}
                          onChange={(e) => setWaterAmountInput(e.target.value === '' ? '' : Math.abs(parseInt(e.target.value, 10)))}
                          placeholder="Quantidade personalizada..."
                          min={10}
                          max={10000}
                          className="w-full text-xs font-semibold text-white bg-slate-900 border border-slate-800 rounded-xl px-4 py-3.5 focus:outline-none focus:border-cyan-500 focus:bg-slate-950 transition-all placeholder:text-slate-500"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-450 uppercase tracking-wider font-mono">ML</span>
                      </div>
                      <button
                        onClick={() => handleLogWater()}
                        disabled={logLoading || !waterAmountInput}
                        className="bg-cyan-600 hover:bg-cyan-550 text-white font-extrabold px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-[0_4px_12px_rgba(6,182,212,0.15)] cursor-pointer shrink-0 disabled:bg-slate-900 disabled:text-slate-650 border border-slate-850/20"
                      >
                        Bebi
                      </button>
                    </div>
                  </div>

                </div>

                {/* 3. HISTÓRICO DE HOJE & TOP 5 (Right Column) */}
                <div className="lg:col-span-3 flex flex-col gap-6" id="hydration-right-stack">
                  
                  {/* Histórico de Hoje card */}
                  <div className="bg-slate-950/80 p-5 rounded-[24px] border border-cyan-500/10 shadow-glow-blue flex flex-col min-h-[190px]">
                    <h3 className="font-display font-semibold text-xs text-slate-400 mb-3 uppercase tracking-wider">Histórico de Hoje</h3>
                    
                    {usersTodayLogs.length === 0 ? (
                      <div className="flex-grow flex items-center justify-center p-4">
                        <p className="text-xs italic text-slate-500 text-center font-medium font-sans">
                          Nenhum gole registrado hoje.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                        {usersTodayLogs.map((log) => (
                          <div
                            key={log.id}
                            className="bg-slate-900/60 hover:bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-cyan-400 font-sans">💧</span>
                              <div>
                                <p className="font-bold text-slate-200">{log.amount} ml</p>
                                <p className="text-[9px] text-slate-500 font-mono">
                                  {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteLog(log.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/20 rounded transition-colors cursor-pointer"
                              title="Deletar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Top 5 do Dia card */}
                  <div className="bg-slate-950/80 p-5 rounded-[24px] border border-cyan-500/10 shadow-glow-blue flex flex-col min-h-[224px]">
                    <h3 className="font-display font-semibold text-xs text-slate-400 mb-3 uppercase tracking-wider">Top Hoje</h3>
                    
                    {ranking.length === 0 ? (
                      <div className="flex-grow flex items-center justify-center p-4">
                        <p className="text-xs italic text-slate-500 text-center font-medium font-sans">
                          Nenhum consumo.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                        {ranking.slice(0, 5).map((item, index) => {
                          const isMe = item.email.toLowerCase() === email?.toLowerCase();
                          return (
                            <div
                              key={item.email}
                              className={`bg-slate-900/40 px-3 py-2 rounded-lg border flex items-center justify-between text-xs ${
                                isMe ? 'border-cyan-500/30 bg-cyan-950/20' : 'border-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2 max-w-[70%]">
                                <span className={`text-[10px] font-mono font-bold w-4 text-center ${index === 0 ? 'text-amber-500' : index === 1 ? 'text-slate-400' : index === 2 ? 'text-orange-400' : 'text-slate-500'}`}>
                                  #{index + 1}
                                </span>
                                <span className="text-base shrink-0">{item.avatar}</span>
                                <p className="font-semibold text-slate-200 truncate pr-1">{item.username}</p>
                              </div>
                              <span className="font-bold text-cyan-400 shrink-0 font-mono">{item.totalAmount}ml</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>

              </div>
            )}

            {/* TAB-2: RANKING TAB PAGE */}
            {activeTab === 'ranking' && (
              <div className="bg-slate-950/80 p-6 md:p-8 rounded-[24px] border border-cyan-500/10 shadow-glow-cyan" id="view-ranking-tab">
                
                {/* Board headers */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-800 pb-6 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-cyan-950/80 border border-cyan-800/60 text-cyan-400 rounded-xl" id="trophy-lead-icon">
                      <Trophy className="w-5 h-5 fill-current/10" />
                    </div>
                    <div>
                      <h2 className="font-display font-extrabold text-lg text-white leading-none">Quadro de Líderes</h2>
                      <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mt-1.5">
                        Competição corporativa semanal & diária
                      </p>
                    </div>
                  </div>

                  {/* Period filter buttons + refresh */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fetchRankings()}
                      disabled={rankingLoading}
                      className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all cursor-pointer"
                      title="Recarregar"
                    >
                      <RefreshCw className={`w-4 h-4 ${rankingLoading ? 'animate-spin' : ''}`} />
                    </button>

                    <div className="bg-slate-900 p-1 rounded-xl flex gap-1 border border-slate-800" id="ranking-period-filters">
                      {[
                        { id: 'today', short: 'Hoje' },
                        { id: 'week', short: 'Semana' },
                        { id: 'month', short: 'Mês' },
                        { id: 'overall', short: 'Geral' }
                      ].map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setPeriod(p.id as RankingPeriod)}
                          className={`text-[10px] uppercase font-bold tracking-wider px-3.5 py-1.5 transition-all cursor-pointer rounded-lg ${
                            period === p.id
                              ? 'bg-cyan-500 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {p.short}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* RANKING FETCHING STATES */}
                {rankingLoading && ranking.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                    <p className="text-xs font-mono font-bold uppercase tracking-widest text-slate-500">Consolidando dados no servidor...</p>
                  </div>
                ) : ranking.length === 0 ? (
                  <div className="text-center py-16 flex flex-col items-center justify-center gap-4 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
                    <Award className="w-12 h-12 text-slate-600" />
                    <div>
                      <h3 className="font-display font-bold text-base text-slate-400 uppercase">Período Vazio</h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm">No momento, nenhum colega registrou consumo de água neste período.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    
                    {/* PODIUM OF CHAMPIONS */}
                    <div className="grid grid-cols-3 gap-3 pt-4 border-b border-slate-800 pb-8 max-w-2xl mx-auto" id="ranking-podium-grid">
                      
                      {/* 2nd place (Prata) on the left */}
                      <div className="flex flex-col items-center justify-end" id="silver-chimp flex">
                        {podium2nd ? (
                          <div className="w-full text-center flex flex-col items-center">
                            <div className="relative mb-2">
                              <span className="text-3xl w-14 h-14 bg-slate-900 border-2 border-slate-705 rounded-full flex items-center justify-center shadow-xs" role="img" aria-label="avatar silver">
                                {podium2nd.avatar}
                              </span>
                              <span className="absolute -bottom-1 -right-1 bg-slate-500 border border-slate-950 text-white font-extrabold text-[9px] w-5 h-5 flex items-center justify-center rounded-full font-mono">
                                2
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-200 truncate w-full max-w-24 px-1">{podium2nd.username}</p>
                            <p className="text-[10px] font-mono font-bold text-slate-450">{podium2nd.totalAmount}ml</p>
                            <div className="w-full bg-slate-900 h-10 rounded-t-xl mt-3 flex items-center justify-center border border-slate-800/80">
                              <span className="text-[9px] font-extrabold text-[#94a3b8] uppercase tracking-widest font-mono">Prata</span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-24 bg-slate-900 border border-dashed border-slate-800 rounded-xl"></div>
                        )}
                      </div>

                      {/* 1st place (GOLD) in the middle */}
                      <div className="flex flex-col items-center justify-end" id="gold-chimp flex">
                        {podium1st ? (
                          <div className="w-full text-center flex flex-col items-center">
                            <span className="text-lg text-amber-500 mb-1 animate-bounce">👑</span>
                            <div className="relative mb-2">
                              <span className="text-4xl w-16 h-16 bg-amber-950/40 border-2 border-amber-400 rounded-full flex items-center justify-center shadow-xs" role="img" aria-label="avatar gold">
                                {podium1st.avatar}
                              </span>
                              <span className="absolute -bottom-1 -right-1 bg-amber-500 border border-slate-950 text-white font-extrabold text-[10px] w-5.5 h-5.5 flex items-center justify-center rounded-full">
                                1
                              </span>
                            </div>
                            <p className="text-xs font-extrabold text-[#f1f5f9] truncate w-full max-w-28 px-1 uppercase tracking-tight">{podium1st.username}</p>
                            <p className="text-[10px] font-mono font-bold text-cyan-400">{podium1st.totalAmount}ml</p>
                            <div className="w-full bg-amber-950/20 h-14 rounded-t-xl mt-3 flex flex-col items-center justify-center border border-amber-500/20 shadow-xs">
                              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest font-mono">Ouro</span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-32 bg-slate-900 border border-dashed border-slate-800 rounded-xl"></div>
                        )}
                      </div>

                      {/* 3rd place (Bronze) on the right */}
                      <div className="flex flex-col items-center justify-end" id="bronze-chimp flex">
                        {podium3rd ? (
                          <div className="w-full text-center flex flex-col items-center">
                            <div className="relative mb-2">
                              <span className="text-3xl w-14 h-14 bg-orange-950/40 border-2 border-orange-500 rounded-full flex items-center justify-center shadow-xs" role="img" aria-label="avatar bronze">
                                {podium3rd.avatar}
                              </span>
                              <span className="absolute -bottom-1 -right-1 bg-orange-500 border border-slate-950 text-white font-extrabold text-[9px] w-5 h-5 flex items-center justify-center rounded-full">
                                3
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-200 truncate w-full max-w-24 px-1">{podium3rd.username}</p>
                            <p className="text-[10px] font-mono font-bold text-slate-450">{podium3rd.totalAmount}ml</p>
                            <div className="w-full bg-slate-900 h-8 rounded-t-xl mt-3 flex items-center justify-center border border-slate-800/80">
                              <span className="text-[9px] font-extrabold text-orange-500 uppercase tracking-widest font-bold font-mono">Bronze</span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-20 bg-slate-900 border border-dashed border-slate-800 rounded-xl"></div>
                        )}
                      </div>

                    </div>

                    {/* TABLE CONTROLS AND SEARCH */}
                    <div className="space-y-4">
                      
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <h3 className="text-xs font-bold text-slate-400 tracking-widest pl-1 uppercase">Membros Ativos ({ranking.length})</h3>
                        
                        <div className="relative flex-grow sm:flex-grow-0 max-w-md">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={rankingSearch}
                            onChange={(e) => setRankingSearch(e.target.value)}
                            placeholder="Buscar guerreiro d'água..."
                            className="text-xs w-full sm:w-64 pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none focus:border-cyan-500 text-white placeholder:text-slate-500 font-semibold"
                          />
                        </div>
                      </div>

                      {/* Logged in User highlight position badge */}
                      {myRankItem && (
                        <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-2xl p-4 flex items-center justify-between" id="myplacement-highlight-row">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black bg-cyan-600 text-white w-7 h-7 flex items-center justify-center rounded-lg">
                              #{myRankItem.rank}
                            </span>
                            <span className="text-2xl">{myRankItem.avatar}</span>
                            <div>
                              <p className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                {myRankItem.username}
                                <span className="text-[8px] font-bold bg-slate-900 border border-cyan-800 text-cyan-400 px-2 py-0.5 rounded-full uppercase tracking-wider">Você</span>
                              </p>
                              <p className="text-[9px] text-slate-500 font-mono mt-0.5">{myRankItem.email}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-extrabold text-cyan-400 font-mono">{myRankItem.totalAmount} ml</p>
                            <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">TOTAL BEBIDO</p>
                          </div>
                        </div>
                      )}

                      {/* Rank Table Listing */}
                      <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
                        <div className="grid grid-cols-12 bg-slate-900/80 border-b border-slate-800 px-4 py-3 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                          <span className="col-span-2 text-center">Rank</span>
                          <span className="col-span-7">Colaborador</span>
                          <span className="col-span-3 text-right">Quantidade</span>
                        </div>

                        <div className="divide-y divide-slate-850 max-h-72 overflow-y-auto">
                          {activeRankingWithMyPosition
                            .filter(item => 
                              item.username.toLowerCase().includes(rankingSearch.toLowerCase()) ||
                              item.email.toLowerCase().includes(rankingSearch.toLowerCase())
                            )
                            .map((item) => {
                              const isMe = item.email.toLowerCase() === email?.toLowerCase();
                              return (
                                <div
                                  key={item.email}
                                  className={`grid grid-cols-12 px-4 py-3.5 items-center text-xs transition-colors ${
                                    isMe ? 'bg-cyan-950/20 hover:bg-cyan-950/30' : 'hover:bg-slate-900/30'
                                  }`}
                                >
                                  <div className="col-span-2 text-center font-bold">
                                    {item.rank <= 3 ? (
                                      <span className="text-normal">
                                        {item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : '🥉'}
                                      </span>
                                    ) : (
                                      <span className="text-slate-500 text-[11px] font-semibold">#{item.rank}</span>
                                    )}
                                  </div>

                                  <div className="col-span-7 flex items-center gap-2.5 min-w-0">
                                    <span className="text-xl shrink-0 w-8 h-8 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-full" role="img" aria-label="avatar">
                                      {item.avatar}
                                    </span>
                                    <div className="truncate">
                                      <p className="font-bold text-slate-200 truncate flex items-center gap-1.5 uppercase tracking-wide text-[10px]">
                                        {item.username}
                                        {isMe && <span className="text-[7px] text-cyan-400 bg-slate-900 border border-cyan-800 px-1 py-0.2 rounded font-bold uppercase">Eu</span>}
                                      </p>
                                      <p className="text-[9px] text-slate-500 truncate leading-none mt-0.5">{item.email}</p>
                                    </div>
                                  </div>

                                  <div className="col-span-3 text-right">
                                    <span className="font-extrabold text-slate-200 font-mono">{item.totalAmount} ml</span>
                                    <p className="text-[8px] text-slate-500 font-semibold mt-0.5">
                                      {item.totalAmount >= goal ? '👑 Atingiu' : '💧 Em andamento'}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          
                          {activeRankingWithMyPosition.filter(item => 
                            item.username.toLowerCase().includes(rankingSearch.toLowerCase()) ||
                            item.email.toLowerCase().includes(rankingSearch.toLowerCase())
                          ).length === 0 && (
                            <p className="text-center text-xs text-slate-500 italic py-8">
                              Nenhum correspondente.
                            </p>
                          )}
                        </div>
                      </div>

                    </div>

                  </div>
                )}

              </div>
            )}

          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-[#030712] border-t border-slate-900 py-8 text-center text-xs text-slate-550 mt-12" id="app-footer">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>© 2026 HydraRank. Seu companheiro diário para manter corpo e mente afiados.</p>
          <div className="flex gap-4 font-semibold text-cyan-400 tracking-wider font-mono text-[10px]">
            <span>💧 HIDRATE-SE</span>
            <span className="text-slate-800">•</span>
            <span>🎯 ALTA PERFORMANCE</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
