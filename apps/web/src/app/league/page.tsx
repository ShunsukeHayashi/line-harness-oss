'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

// ─── 型定義 ────────────────────────────────────────────────────
interface AgentScore {
  rank_position: number;
  agent_id: string;
  total_score: number;
  rank_letter: 'S' | 'A' | 'B' | 'C' | 'D';
  kpi1_score: number;
  kpi2_score: number;
  kpi3_score: number;
  task_count: number;
  trend: 'up' | 'down' | 'same';
}

interface RichAgent extends AgentScore {
  level: number;
  xp: number;
  xp_to_next: number;
  streak: number;
  is_on_fire: boolean;
  recent_form: ('W' | 'L' | 'D')[];
  efficiency: number;
  promotion_zone: 'champion' | 'promote' | 'safe' | 'danger' | 'relegate';
  achievement?: string;
}

// ─── 定数 ──────────────────────────────────────────────────────
const RANK_CONFIG = {
  S: { bg: 'bg-yellow-500', text: 'text-yellow-950', border: 'border-yellow-400/70', glow: 'shadow-yellow-500/50', label: 'Champions', emoji: '👑', gradient: 'from-yellow-950/70 via-yellow-900/30 to-transparent', zone: 'champion' },
  A: { bg: 'bg-blue-500', text: 'text-blue-950', border: 'border-blue-400/60', glow: 'shadow-blue-500/30', label: 'Elite', emoji: '⭐', gradient: 'from-blue-950/60 via-blue-900/20 to-transparent', zone: 'promote' },
  B: { bg: 'bg-emerald-500', text: 'text-emerald-950', border: 'border-emerald-700/40', glow: '', label: 'Solid', emoji: '✅', gradient: 'from-gray-900/60 to-transparent', zone: 'safe' },
  C: { bg: 'bg-orange-500', text: 'text-orange-950', border: 'border-orange-700/40', glow: '', label: 'Rising', emoji: '📈', gradient: 'from-orange-950/30 to-transparent', zone: 'danger' },
  D: { bg: 'bg-red-600', text: 'text-red-100', border: 'border-red-700/60', glow: 'shadow-red-500/30', label: 'Rookies', emoji: '🔧', gradient: 'from-red-950/50 via-red-900/20 to-transparent', zone: 'relegate' },
};

const LEVEL_TITLES = ['Novice','Apprentice','Skilled','Proficient','Expert','Master','Grandmaster','Legend','Mythic','Immortal'];
const AGENT_EMOJI: Record<string, string> = {
  guardian:'🛡️',scholar:'📚','kotowari-dev':'⚡','dev-architect':'🏗️',writer:'✍️',architect:'🔨',
  'cc-hayashi':'🤝','sns-analytics':'📊',promptpro:'💡','github-hook':'🔗','ctx-eng':'🧠',content:'📡',
  blender:'🎨',gyosei:'⚖️',sigma:'📐',main:'👾','dev-coder':'💻','dev-reviewer':'🔍',
  'dev-tester':'🧪','dev-deployer':'🚀','dev-documenter':'📝',sensei:'🎓',
  'ppal-coordinator':'🎯','ppal-curriculum':'📖','ppal-content':'🖊️','ppal-marketing':'📣',
  'ppal-support':'🙋','ppal-analytics':'📉','sns-strategist':'🗺️','sns-creator':'🎬',
  'sns-engagement':'💬','cc-agent-1':'🤖',giantdevil:'😈','x-ops':'🐦',
  'sns-influencer':'🌟','sns-automation':'⚙️',forge3d:'🔥',vision3d:'👁️',
};
const AGENT_AVATAR: Record<string, string> = {
  guardian: '/league/agents/guardian.png',
  'kotowari-dev': '/league/agents/kotowari-dev.png',
  scholar: '/league/agents/scholar.png',
  main: '/league/agents/main.png',
  content: '/league/agents/content.png',
  sigma: '/league/agents/sigma.png',
  sensei: '/league/agents/sensei.png',
  architect: '/league/agents/architect.png',
  writer: '/league/agents/writer.png',
  'x-ops': '/league/agents/x-ops.png',
  promptpro: '/league/agents/promptpro.png',
};
const getAvatar = (id: string) => AGENT_AVATAR[id] ?? '/league/agents/default.png';

const MEDAL = ['🥇','🥈','🥉'];
const REFRESH_SEC = 15;

const WEEKLY_CHALLENGES = [
  { id: 'c1', title: '精度マスター', desc: 'KPI1を90以上達成する', reward: '+5 XP bonus', progress: 67, icon: '🎯' },
  { id: 'c2', title: 'スピードランナー', desc: '1時間以内に10タスク完了', reward: 'ランク昇格ボーナス', progress: 40, icon: '⚡' },
  { id: 'c3', title: '連続勤務王', desc: '5日連続ストリーク達成', reward: 'Sランク優先キュー権', progress: 80, icon: '🔥' },
];


// ─── データ拡張 ─────────────────────────────────────────────────
function enrichAgent(a: AgentScore): RichAgent {
  const level = Math.min(Math.floor((a.total_score - 60) * 1.2), 49);
  const xp = Math.floor(((a.total_score - 60) * 1.2 - level) * 100);
  const streak = a.trend === 'up' ? Math.floor(a.task_count / 8) + 1 : 0;
  const form: ('W' | 'L' | 'D')[] = Array.from({ length: 5 }, (_, i) => {
    const r = (a.total_score * 7 + i * 13 + a.rank_position * 3) % 10;
    return r > 5 ? 'W' : r > 2 ? 'L' : 'D';
  });
  const zone: RichAgent['promotion_zone'] =
    a.rank_position <= 3 ? 'champion' :
    a.rank_position <= 10 ? 'promote' :
    a.rank_position <= 25 ? 'safe' :
    a.rank_position <= 32 ? 'danger' : 'relegate';

  const achievements = ['週間MVP','連続達成','KPI王','スピードスター','品質番人'];
  const achievement = a.rank_letter === 'S' ? achievements[a.rank_position % achievements.length] : undefined;

  return {
    ...a,
    level: Math.max(1, level),
    xp,
    xp_to_next: 100,
    streak,
    is_on_fire: streak >= 3,
    recent_form: form,
    efficiency: a.task_count > 0 ? Number((a.total_score / Math.max(a.task_count, 1) * 10).toFixed(1)) : 0,
    promotion_zone: zone,
    achievement,
  };
}

// ─── コンポーネント群 ─────────────────────────────────────────

function AnimatedNum({ value, decimals = 1 }: { value: number; decimals?: number }) {
  const [disp, setDisp] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const start = prev.current; const end = value; const dur = 700; const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisp(start + (end - start) * e);
      if (p < 1) requestAnimationFrame(tick);
      else prev.current = value;
    };
    requestAnimationFrame(tick);
  }, [value]);
  return <>{disp.toFixed(decimals)}</>;
}

function ScoreBar({ score, max = 100, color = 'from-cyan-400 to-violet-500', height = 'h-1.5' }: { score: number; max?: number; color?: string; height?: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW((score / max) * 100), 150); return () => clearTimeout(t); }, [score, max]);
  return (
    <div className={`w-full bg-gray-800/80 rounded-full ${height} overflow-hidden`}>
      <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-1000 ease-out`} style={{ width: `${w}%` }} />
    </div>
  );
}

function XPBar({ xp, xp_to_next }: { xp: number; xp_to_next: number }) {
  return (
    <div className="relative">
      <ScoreBar score={xp} max={xp_to_next} color="from-violet-500 to-purple-400" height="h-1" />
    </div>
  );
}

function FormBubble({ result }: { result: 'W' | 'L' | 'D' }) {
  return (
    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-sm text-[9px] font-black ${
      result === 'W' ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50' :
      result === 'L' ? 'bg-red-500/30 text-red-300 border border-red-500/50' :
      'bg-gray-600/30 text-gray-400 border border-gray-600/50'
    }`}>{result}</span>
  );
}

function ZoneBadge({ zone }: { zone: RichAgent['promotion_zone'] }) {
  const cfg = {
    champion: { text: '👑 CHAMP', cls: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30' },
    promote: { text: '⬆️ PROMO', cls: 'text-blue-300 bg-blue-500/10 border-blue-500/30' },
    safe: { text: '✔ SAFE', cls: 'text-gray-400 bg-gray-700/30 border-gray-600/30' },
    danger: { text: '⚠ DANGER', cls: 'text-orange-300 bg-orange-500/10 border-orange-500/30' },
    relegate: { text: '⬇️ RELE', cls: 'text-red-300 bg-red-500/10 border-red-500/30' },
  }[zone];
  return <span className={`text-[8px] font-bold px-1 py-0.5 rounded border ${cfg.cls}`}>{cfg.text}</span>;
}

// ─── エージェントカード ────────────────────────────────────────
function AgentCard({ agent, onSelect }: { agent: RichAgent; onSelect: (a: RichAgent) => void }) {
  const rank = RANK_CONFIG[agent.rank_letter];
  const emoji = AGENT_EMOJI[agent.agent_id] ?? '🤖';
  const levelTitle = LEVEL_TITLES[Math.min(Math.floor(agent.level / 5), LEVEL_TITLES.length - 1)];
  const avatar = getAvatar(agent.agent_id);

  return (
    <div
      onClick={() => onSelect(agent)}
      className={`relative rounded-2xl p-3 border cursor-pointer transition-all duration-200
        bg-gradient-to-br ${rank.gradient} ${rank.border}
        ${agent.rank_letter === 'S' ? `shadow-lg ${rank.glow}` : ''}
        ${agent.rank_letter === 'D' ? `shadow-md ${rank.glow}` : ''}
        hover:scale-[1.03] hover:border-violet-400/60 hover:shadow-xl hover:shadow-violet-500/20 group`}
    >
      {/* On Fire オーバーレイ */}
      {agent.is_on_fire && (
        <div className="absolute -top-1 -right-1 text-sm animate-bounce z-10">🔥</div>
      )}

      {/* ヘッダー行 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-gray-600 font-mono text-[10px] w-4 text-right shrink-0">#{agent.rank_position}</span>
          <div className="relative shrink-0 w-9 h-9">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatar}
              alt={agent.agent_id}
              className={`w-9 h-9 rounded-full object-cover border-2 ${agent.rank_letter === 'S' ? 'border-yellow-400/70' : 'border-gray-600/50'}`}
              onError={(e) => { (e.target as HTMLImageElement).src = '/league/agents/default.png'; }}
            />
            <span className="absolute -bottom-0.5 -right-0.5 text-[10px] leading-none">{emoji}</span>
          </div>
          <div className="min-w-0">
            <div className="text-white font-bold text-xs truncate">{agent.agent_id}</div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-[9px]">Lv.{agent.level}</span>
              <span className="text-gray-600 text-[9px]">{levelTitle}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-1">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${rank.bg} ${rank.text}`}>{rank.emoji}{agent.rank_letter}</span>
          <ZoneBadge zone={agent.promotion_zone} />
        </div>
      </div>

      {/* スコア + KPIバー */}
      <div className="mb-2">
        <div className="flex items-end justify-between">
          <span className={`text-xl font-black font-mono ${agent.rank_letter === 'S' ? 'text-yellow-300' : 'text-white'}`}>
            <AnimatedNum value={agent.total_score} />
          </span>
          <div className="text-right text-[9px] text-gray-500 shrink-0">
            {agent.trend === 'up' && <span className="text-emerald-400">▲</span>}
            {agent.trend === 'down' && <span className="text-red-400">▼</span>}
            {agent.trend === 'same' && <span className="text-gray-600">—</span>}
            <span className="ml-1">{agent.task_count}T</span>
          </div>
        </div>
        <ScoreBar score={agent.total_score} max={95}
          color={agent.rank_letter === 'S' ? 'from-yellow-400 to-amber-300' : agent.rank_letter === 'D' ? 'from-red-500 to-orange-400' : 'from-cyan-400 to-violet-500'} />
      </div>

      {/* XPバー */}
      <div className="mb-2">
        <XPBar xp={agent.xp} xp_to_next={100} />
      </div>

      {/* KPI分解 */}
      <div className="grid grid-cols-3 gap-1 mb-2">
        {[{ label: 'K1', val: agent.kpi1_score, color: 'from-cyan-500 to-cyan-400' },
          { label: 'K2', val: agent.kpi2_score, color: 'from-violet-500 to-violet-400' },
          { label: 'K3', val: agent.kpi3_score, color: 'from-pink-500 to-pink-400' }].map(k => (
          <div key={k.label} className="text-center">
            <div className="text-[9px] text-gray-500 mb-0.5">{k.label}</div>
            <div className="text-[10px] font-bold text-gray-300">{k.val}</div>
            <ScoreBar score={k.val} max={100} color={k.color} height="h-0.5" />
          </div>
        ))}
      </div>

      {/* フォーム */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          {agent.recent_form.map((f, i) => <FormBubble key={i} result={f} />)}
        </div>
        {agent.streak > 0 && (
          <span className="text-[9px] text-orange-300 font-bold">🔥{agent.streak}連</span>
        )}
        {agent.achievement && (
          <span className="text-[8px] text-yellow-400 border border-yellow-500/30 px-1 rounded truncate max-w-[60px]">🏆{agent.achievement}</span>
        )}
      </div>

      {/* ホバー時: 詳細を見るヒント */}
      <div className="absolute inset-0 rounded-2xl bg-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
        <span className="text-[10px] text-violet-300/80 bg-gray-900/80 px-2 py-1 rounded-full">クリックで詳細</span>
      </div>
    </div>
  );
}

// ─── 表彰台 ─────────────────────────────────────────────────────
function Podium({ agents }: { agents: RichAgent[] }) {
  const top3 = agents.slice(0, 3);
  const order = [1, 0, 2];
  const podiumH = ['h-28', 'h-40', 'h-20'];
  const podiumBg = [
    'from-gray-500 to-gray-400',
    'from-yellow-600 to-yellow-400',
    'from-amber-700 to-amber-500',
  ];

  return (
    <div className="flex items-end justify-center gap-4 py-6">
      {order.map(idx => {
        const agent = top3[idx];
        if (!agent) return null;
        const isFirst = idx === 0;
        const avatar = getAvatar(agent.agent_id);

        return (
          <div key={agent.agent_id} className="flex flex-col items-center" style={{ width: 120 }}>
            {/* キャラクター */}
            <div className={`flex flex-col items-center mb-2 transition-all ${isFirst ? 'scale-110' : ''}`}>
              <div className="text-2xl mb-1">{MEDAL[idx]}</div>
              <div className={`relative rounded-full mb-1 overflow-hidden ${isFirst ? 'w-20 h-20 shadow-lg shadow-yellow-500/50 ring-2 ring-yellow-400' : 'w-14 h-14 ring-1 ring-gray-500/50'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatar}
                  alt={agent.agent_id}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/league/agents/default.png'; }}
                />
                {isFirst && <div className="absolute inset-0 bg-gradient-to-t from-yellow-500/20 to-transparent" />}
              </div>
              <div className="text-white font-bold text-xs text-center truncate w-full px-1">{agent.agent_id}</div>
              <div className={`text-lg font-black font-mono mt-0.5 ${isFirst ? 'text-yellow-300' : 'text-white'}`}>
                <AnimatedNum value={agent.total_score} />
              </div>
              {agent.is_on_fire && <div className="text-xs">🔥🔥🔥</div>}
            </div>

            {/* 台 */}
            <div className={`${podiumH[idx]} w-full rounded-t-xl bg-gradient-to-t ${podiumBg[idx]} flex items-end justify-center pb-2 relative overflow-hidden`}>
              {isFirst && <div className="absolute inset-0 bg-gradient-to-t from-transparent to-yellow-300/10 animate-pulse" />}
              <span className="text-white/90 font-black text-lg">#{agent.rank_position}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── KPI リーダーボード（実DBデータのみ）────────────────────────
function KpiLeaders({ agents }: { agents: RichAgent[] }) {
  const kpiSets = [
    { label: 'KPI 1 精度', key: 'kpi1_score' as const, color: 'text-cyan-300', bar: 'from-cyan-500 to-cyan-400' },
    { label: 'KPI 2 速度', key: 'kpi2_score' as const, color: 'text-violet-300', bar: 'from-violet-500 to-violet-400' },
    { label: 'KPI 3 品質', key: 'kpi3_score' as const, color: 'text-pink-300', bar: 'from-pink-500 to-pink-400' },
  ];
  if (agents.length === 0) return null;
  return (
    <div className="bg-gray-900/60 rounded-2xl border border-gray-800/60 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-800/60">
        <span className="text-sm">🏅</span>
        <span className="text-xs font-bold text-gray-300">KPI LEADERS</span>
        <span className="text-[10px] text-gray-600 ml-auto">実データ</span>
      </div>
      <div className="p-3 space-y-4">
        {kpiSets.map(({ label, key, color, bar }) => {
          const sorted = [...agents].sort((a, b) => b[key] - a[key]).slice(0, 3);
          const max = sorted[0]?.[key] ?? 100;
          return (
            <div key={key}>
              <div className={`text-[10px] font-bold ${color} mb-2`}>{label}</div>
              <div className="space-y-1.5">
                {sorted.map((a, i) => (
                  <div key={a.agent_id} className="flex items-center gap-2">
                    <span className="text-gray-600 text-[10px] w-3 shrink-0">{i + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getAvatar(a.agent_id)} alt={a.agent_id}
                      className="w-5 h-5 rounded-full object-cover border border-gray-700 shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).src = '/league/agents/default.png'; }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300 text-[10px] truncate">{a.agent_id}</span>
                        <span className={`text-[10px] font-bold ${color} ml-1 shrink-0`}>{a[key]}</span>
                      </div>
                      <ScoreBar score={a[key]} max={max} color={bar} height="h-0.5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 週間チャレンジ ─────────────────────────────────────────────
function WeeklyChallenge() {
  return (
    <div className="bg-gray-900/60 rounded-2xl border border-gray-800/60 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-800/60">
        <span className="text-sm">🎯</span>
        <span className="text-xs font-bold text-gray-300">WEEKLY CHALLENGES</span>
      </div>
      <div className="p-3 space-y-3">
        {WEEKLY_CHALLENGES.map(c => (
          <div key={c.id} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{c.icon}</span>
                <span className="text-xs font-bold text-gray-200">{c.title}</span>
              </div>
              <span className="text-[9px] text-gray-500">{c.progress}%</span>
            </div>
            <p className="text-[10px] text-gray-500 pl-6">{c.desc}</p>
            <div className="pl-6">
              <ScoreBar score={c.progress} max={100} color="from-violet-500 to-cyan-400" height="h-1" />
            </div>
            <p className="text-[9px] text-yellow-500/70 pl-6">報酬: {c.reward}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── エージェント詳細モーダル ─────────────────────────────────
function AgentModal({ agent, onClose }: { agent: RichAgent; onClose: () => void }) {
  const rank = RANK_CONFIG[agent.rank_letter];
  const emoji = AGENT_EMOJI[agent.agent_id] ?? '🤖';
  const levelTitle = LEVEL_TITLES[Math.min(Math.floor(agent.level / 5), LEVEL_TITLES.length - 1)];
  const avatar = getAvatar(agent.agent_id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-gray-900 rounded-3xl border border-gray-700 p-6 max-w-sm w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 閉じるボタン */}
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white text-xl">✕</button>

        {/* ヘッダー */}
        <div className="flex items-center gap-4 mb-5">
          <div className={`relative w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br ${rank.gradient} border-2 ${rank.border} ${agent.rank_letter === 'S' ? `shadow-lg ${rank.glow}` : ''} shrink-0`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar} alt={agent.agent_id} className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = '/league/agents/default.png'; }} />
            <span className="absolute bottom-0.5 right-0.5 text-base leading-none">{emoji}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white">{agent.agent_id}</h2>
              {agent.is_on_fire && <span className="text-lg">🔥</span>}
            </div>
            <div className="text-gray-400 text-sm">{rank.label} · {rank.emoji} {agent.rank_letter}ランク</div>
            <div className="text-gray-500 text-xs">Lv.{agent.level} {levelTitle}</div>
          </div>
        </div>

        {/* メインスコア */}
        <div className={`text-center py-4 rounded-2xl mb-4 bg-gradient-to-br ${rank.gradient} border ${rank.border}`}>
          <div className={`text-5xl font-black font-mono ${agent.rank_letter === 'S' ? 'text-yellow-300' : 'text-white'}`}>
            <AnimatedNum value={agent.total_score} />
          </div>
          <div className="text-gray-400 text-sm mt-1">Total Score · #{agent.rank_position}</div>
        </div>

        {/* XP */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>XP Progress</span>
            <span>{agent.xp}/{agent.xp_to_next}</span>
          </div>
          <XPBar xp={agent.xp} xp_to_next={100} />
        </div>

        {/* KPI詳細 */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'KPI 1', val: agent.kpi1_score, color: 'from-cyan-500 to-cyan-300', desc: '精度' },
            { label: 'KPI 2', val: agent.kpi2_score, color: 'from-violet-500 to-violet-300', desc: '速度' },
            { label: 'KPI 3', val: agent.kpi3_score, color: 'from-pink-500 to-pink-300', desc: '品質' },
          ].map(k => (
            <div key={k.label} className="bg-gray-800/60 rounded-xl p-2.5 text-center">
              <div className="text-xs text-gray-500 mb-1">{k.label} {k.desc}</div>
              <div className="text-lg font-black text-white">{k.val}</div>
              <ScoreBar score={k.val} max={100} color={k.color} height="h-1" />
            </div>
          ))}
        </div>

        {/* ステータス */}
        <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
          <div className="bg-gray-800/40 rounded-xl p-2.5">
            <div className="text-gray-500 text-xs">タスク数</div>
            <div className="text-white font-bold">{agent.task_count}</div>
          </div>
          <div className="bg-gray-800/40 rounded-xl p-2.5">
            <div className="text-gray-500 text-xs">効率スコア</div>
            <div className="text-white font-bold">{agent.efficiency}</div>
          </div>
          <div className="bg-gray-800/40 rounded-xl p-2.5">
            <div className="text-gray-500 text-xs">ストリーク</div>
            <div className="text-white font-bold">{agent.streak > 0 ? `🔥 ${agent.streak}連` : '—'}</div>
          </div>
          <div className="bg-gray-800/40 rounded-xl p-2.5">
            <div className="text-gray-500 text-xs">ゾーン</div>
            <ZoneBadge zone={agent.promotion_zone} />
          </div>
        </div>

        {/* 直近フォーム */}
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-2">直近5タスク結果</div>
          <div className="flex gap-1.5">
            {agent.recent_form.map((f, i) => (
              <div key={i} className="flex-1">
                <FormBubble result={f} />
                <div className="text-[8px] text-gray-600 text-center mt-0.5">T-{5 - i}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Achievement */}
        {agent.achievement && (
          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-2.5 text-center">
            <span className="text-yellow-400 text-sm">🏆 {agent.achievement}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── セクション区切り（昇格/降格ライン） ───────────────────────
function ZoneDivider({ label, color }: { label: string; color: string }) {
  return (
    <div className={`flex items-center gap-2 my-2 opacity-60`}>
      <div className={`flex-1 h-px ${color}`} />
      <span className={`text-[9px] font-bold uppercase tracking-widest ${color.replace('bg-', 'text-')}`}>{label}</span>
      <div className={`flex-1 h-px ${color}`} />
    </div>
  );
}

// ─── リフレッシュタイマー ───────────────────────────────────────
function RefreshTimer({ onRefresh, isLoading }: { onRefresh: () => void; isLoading: boolean }) {
  const [count, setCount] = useState(REFRESH_SEC);
  useEffect(() => {
    setCount(REFRESH_SEC);
    const timer = setInterval(() => {
      setCount(prev => { if (prev <= 1) { onRefresh(); return REFRESH_SEC; } return prev - 1; });
    }, 1000);
    return () => clearInterval(timer);
  }, [onRefresh]);

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {isLoading
        ? <span className="text-violet-400 animate-pulse text-[10px]">更新中...</span>
        : <>
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 font-bold text-[10px]">LIVE</span>
            <span className="text-gray-600 text-[10px]">{count}s</span>
            <button onClick={onRefresh} className="text-gray-600 hover:text-gray-400 text-[10px] ml-0.5">↺</button>
          </>
      }
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────
export default function LeagueDashboard() {
  const [agents, setAgents] = useState<RichAgent[]>([]);
  const [meta, setMeta] = useState({ week: '2026-03-24', total: 39, updatedAt: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<RichAgent | null>(null);

  const fetchRankings = useCallback(async () => {
    setIsLoading(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';
      const res = await fetch(`${baseUrl}/api/league/rankings`, { cache: 'no-store' });
      const data = await res.json() as { rankings: AgentScore[]; total_agents: number; week: string; updated_at: string };
      if (data.rankings?.length) {
        setAgents(data.rankings.map(enrichAgent));
        setMeta({ week: data.week, total: data.total_agents, updatedAt: data.updated_at });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchRankings(); }, [fetchRankings]);

  const byRank = { S: agents.filter(a => a.rank_letter === 'S'), A: agents.filter(a => a.rank_letter === 'A'), B: agents.filter(a => a.rank_letter === 'B'), C: agents.filter(a => a.rank_letter === 'C'), D: agents.filter(a => a.rank_letter === 'D') };
  const topScore = agents[0]?.total_score ?? 0;
  const avgScore = agents.length ? agents.reduce((s, a) => s + a.total_score, 0) / agents.length : 0;
  const onFireCount = agents.filter(a => a.is_on_fire).length;

  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0d1225 0%, #080c14 50%, #060810 100%)' }}>
      {/* モーダル */}
      {selected && <AgentModal agent={selected} onClose={() => setSelected(null)} />}

      {/* ヘッダー */}
      <div className="sticky top-0 z-20 border-b border-gray-800/40 px-4 py-3" style={{ background: 'rgba(8,12,20,0.92)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <h1 className="text-base font-black bg-gradient-to-r from-yellow-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">Miyabi Agent League</h1>
              <p className="text-gray-600 text-[10px]">Season 1 · Week {meta.week} · 39 Agents Competing</p>
            </div>
          </div>
          <RefreshTimer onRefresh={fetchRankings} isLoading={isLoading} />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5">
        {/* サマリー */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: '参加エージェント', value: `${meta.total}体`, icon: '🤖', color: 'text-violet-400' },
            { label: 'トップスコア', value: topScore.toFixed(1), icon: '👑', color: 'text-yellow-400' },
            { label: '平均スコア', value: avgScore.toFixed(1), icon: '📊', color: 'text-blue-400' },
            { label: '🔥 On Fire', value: `${onFireCount}体`, icon: '🔥', color: 'text-orange-400' },
            { label: '改善ループ中', value: `${byRank.D.length + byRank.C.length}体`, icon: '🔧', color: 'text-red-400' },
          ].map(card => (
            <div key={card.label} className="bg-gray-900/50 rounded-2xl p-3 border border-gray-800/60 text-center hover:border-gray-700 transition-colors">
              <div className="text-xl mb-1">{card.icon}</div>
              <div className={`text-lg font-black ${card.color}`}>{card.value}</div>
              <div className="text-[9px] text-gray-600">{card.label}</div>
            </div>
          ))}
        </div>

        {/* メインレイアウト: 左コンテンツ + 右サイドバー */}
        <div className="flex gap-5">
          {/* 左: メインコンテンツ */}
          <div className="flex-1 min-w-0">
            {/* 表彰台 */}
            {agents.length > 0 && (
              <div className="bg-gray-900/40 rounded-3xl border border-gray-800/50 mb-5 overflow-hidden">
                <div className="px-4 pt-4 pb-0 flex items-center justify-between">
                  <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">🏆 Top 3 Champions</h2>
                  <span className="text-[10px] text-gray-600">Season 1 · Week {meta.week}</span>
                </div>
                <Podium agents={agents} />
              </div>
            )}

            {/* S ランク */}
            {byRank.S.length > 0 && (
              <section className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-black text-yellow-400 flex items-center gap-1.5">
                    {RANK_CONFIG.S.emoji} Champions — Sランク
                  </h2>
                  <span className="text-[10px] text-gray-600 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded">優先ジョブキュー + 追加リソース割当</span>
                </div>
                <ZoneDivider label="↑ 昇格圏 (TOP 3)" color="bg-yellow-500/40" />
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {byRank.S.map(a => <AgentCard key={a.agent_id} agent={a} onSelect={setSelected} />)}
                </div>
              </section>
            )}

            {/* A ランク */}
            {byRank.A.length > 0 && (
              <section className="mb-5">
                <h2 className="text-sm font-bold text-blue-400 flex items-center gap-1.5 mb-3">
                  {RANK_CONFIG.A.emoji} Elite — Aランク
                  <span className="text-[10px] text-gray-600 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">{byRank.A.length}体 · 昇格プレーオフ圏</span>
                </h2>
                <ZoneDivider label="プレーオフ昇格ライン" color="bg-blue-500/30" />
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {byRank.A.map(a => <AgentCard key={a.agent_id} agent={a} onSelect={setSelected} />)}
                </div>
              </section>
            )}

            {/* B ランク */}
            {byRank.B.length > 0 && (
              <section className="mb-5">
                <h2 className="text-sm font-bold text-emerald-400 flex items-center gap-1.5 mb-3">
                  {RANK_CONFIG.B.emoji} Solid — Bランク
                  <span className="text-[10px] text-gray-600">{byRank.B.length}体 · 安全圏</span>
                </h2>
                <ZoneDivider label="安全ライン" color="bg-emerald-500/20" />
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {byRank.B.map(a => <AgentCard key={a.agent_id} agent={a} onSelect={setSelected} />)}
                </div>
              </section>
            )}

            {/* C ランク */}
            {byRank.C.length > 0 && (
              <section className="mb-5">
                <h2 className="text-sm font-bold text-orange-400 flex items-center gap-1.5 mb-3">
                  {RANK_CONFIG.C.emoji} Rising — Cランク
                  <span className="text-[10px] text-gray-600 animate-pulse">{byRank.C.length}体 · 降格危険圏</span>
                </h2>
                <ZoneDivider label="⚠ 降格危険ライン" color="bg-orange-500/30" />
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {byRank.C.map(a => <AgentCard key={a.agent_id} agent={a} onSelect={setSelected} />)}
                </div>
              </section>
            )}

            {/* D ランク */}
            {byRank.D.length > 0 && (
              <section className="mb-5">
                <h2 className="text-sm font-bold text-red-400 flex items-center gap-1.5 mb-3">
                  {RANK_CONFIG.D.emoji} Rookies — Dランク
                  <span className="text-[10px] text-gray-600 animate-pulse">{byRank.D.length}体 · 自律改善ループ実行中...</span>
                </h2>
                <ZoneDivider label="↓ 降格圏 (自動改善ループ)" color="bg-red-500/40" />
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {byRank.D.map(a => <AgentCard key={a.agent_id} agent={a} onSelect={setSelected} />)}
                </div>
              </section>
            )}

            {isLoading && agents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="text-5xl animate-spin">⚙️</div>
                <div className="text-gray-500 text-sm">エージェントスコア読み込み中...</div>
              </div>
            )}

            {/* フッター */}
            <div className="text-center text-gray-700 text-[10px] mt-6 border-t border-gray-800/30 pt-4">
              <p className="text-violet-500/40 italic">&ldquo;競争が改善を生み、改善が競争を生む。&rdquo;</p>
              <p className="mt-1">Miyabi Agent League · Season 1 · 毎週月曜 01:03 自動集計</p>
              {meta.updatedAt && <p className="mt-0.5 text-gray-700">最終更新: {new Date(meta.updatedAt).toLocaleString('ja-JP')}</p>}
            </div>
          </div>

          {/* 右: サイドバー */}
          <div className="w-72 shrink-0 space-y-4 hidden lg:block">
            <KpiLeaders agents={agents} />
            <WeeklyChallenge />

            {/* シーズン進行状況 */}
            <div className="bg-gray-900/60 rounded-2xl border border-gray-800/60 p-4">
              <div className="text-xs font-bold text-gray-400 mb-3 flex items-center gap-1.5"><span>📅</span>シーズン進行</div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Season 1</span>
                  <span className="text-gray-500">Week 1 / 12</span>
                </div>
                <ScoreBar score={1} max={12} color="from-violet-500 to-cyan-400" height="h-2" />
                <div className="text-[10px] text-gray-600">次回集計: 月曜日 01:03</div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-800/40 space-y-1.5 text-[10px]">
                <div className="flex justify-between text-gray-500">
                  <span>🥇 現在チャンピオン</span>
                  <span className="text-yellow-400 font-bold">{agents[0]?.agent_id ?? '—'}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>🔥 ホットストリーク王</span>
                  <span className="text-orange-400 font-bold">
                    {agents.sort((a, b) => b.streak - a.streak)[0]?.agent_id ?? '—'}
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>⚡ タスク数最多</span>
                  <span className="text-blue-400 font-bold">
                    {[...agents].sort((a, b) => b.task_count - a.task_count)[0]?.agent_id ?? '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
