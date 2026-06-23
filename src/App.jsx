import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

const STORAGE_KEY = "desafio125:data"; // legado: usado antes de existir multiconta
const AUTH_KEY = "desafio125:auth"; // legado: conta única antes da multiconta

// Sessão fica só neste navegador (localStorage), nunca no Neon: senão, qualquer
// login em outro dispositivo sobrescreveria "quem está logado" pra todo mundo.
const localSession = {
  get(key) {
    const value = localStorage.getItem(key);
    return value == null ? null : { value };
  },
  set(key, value) {
    if (value === "" || value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  },
};
const ACCOUNTS_KEY = "desafio125:accounts";
const SESSION_KEY = "desafio125:session";

async function hashPassword(pw) {
  const enc = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
const PRESETS = [10000, 25000, 50000, 125000, 250000, 500000];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function fmtBRL(n) {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function fmtDateBR(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function diffDays(a, b) {
  return Math.round((b - a) / 86400000);
}
function genId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Dado um valor-alvo, calcula quantas cotas (aportes em sequência 1,2,3...)
// são necessárias para somar exatamente esse valor. A última cota é ajustada
// para fechar a conta com precisão.
function computeChallenge(rawGoal) {
  const goal = Math.round(Number(rawGoal));
  if (!goal || goal <= 0) return null;
  let n = Math.ceil((-1 + Math.sqrt(1 + 8 * goal)) / 2);
  if (n < 1) n = 1;
  const sumN = (n * (n + 1)) / 2;
  const diff = sumN - goal;
  const lastValue = n - diff;
  return { goal, totalCotas: n, lastValue };
}

function suggestedValue(seq, challenge) {
  if (!challenge) return seq;
  return seq === challenge.totalCotas ? challenge.lastValue : seq;
}

function buildBlocks(totalCotas) {
  const blocks = [];
  for (let start = 1; start <= totalCotas; start += 100) {
    const end = Math.min(start + 99, totalCotas);
    blocks.push({ label: `${start}–${end}`, start, end });
  }
  return blocks;
}

const MILESTONE_AMOUNTS = [
  500, 1000, 2000, 2500, 5000, 7500, 10000, 15000, 20000, 25000, 30000, 40000,
  50000, 60000, 75000, 100000, 125000, 150000, 175000, 200000, 250000, 300000,
  400000, 500000, 600000, 750000, 800000, 900000, 1000000,
];

function getAchievements({ goal, total, pct, count, totalCotas }) {
  const halfCotas = Math.ceil((totalCotas || 0) / 2);
  const list = [
    {
      id: "first",
      icon: "🏆",
      label: "Primeiro aporte",
      desc: "Registrou o primeiro número do cofre.",
      achieved: count >= 1,
      progress: count >= 1 ? 1 : 0,
    },
    {
      id: "mil",
      icon: "🥇",
      label: "R$ 1.000 guardados",
      desc: "Acumulou R$ 1.000,00 no cofre.",
      achieved: total >= 1000,
      progress: Math.min(total / 1000, 1),
      hide: goal < 1000,
    },
    {
      id: "p25",
      icon: "🥉",
      label: "25% da meta",
      desc: "Chegou a um quarto do caminho.",
      achieved: pct >= 25,
      progress: Math.min(pct / 25, 1),
    },
    {
      id: "p50",
      icon: "🥈",
      label: "50% da meta",
      desc: "Já é a metade do desafio.",
      achieved: pct >= 50,
      progress: Math.min(pct / 50, 1),
    },
    {
      id: "p75",
      icon: "🏅",
      label: "75% da meta",
      desc: "Reta final: três quartos concluídos.",
      achieved: pct >= 75,
      progress: Math.min(pct / 75, 1),
    },
    {
      id: "halfcotas",
      icon: "🎯",
      label: "Metade dos aportes feitos",
      desc: `Preencheu ${halfCotas} dos ${totalCotas} números do cofre.`,
      achieved: count >= halfCotas && halfCotas > 0,
      progress: halfCotas > 0 ? Math.min(count / halfCotas, 1) : 0,
    },
    {
      id: "done",
      icon: "👑",
      label: "Meta concluída",
      desc: "Você bateu a meta do desafio!",
      achieved: pct >= 100,
      progress: Math.min(pct / 100, 1),
    },
  ];
  return list.filter((a) => !a.hide);
}

function getInsights({ goal, total, count, totalCotas, sortedByDate, avgTicket }) {
  if (count === 0) return [];
  const insights = [];

  // inatividade
  const lastDate = sortedByDate[sortedByDate.length - 1]?.date;
  if (lastDate) {
    const days = diffDays(new Date(lastDate), new Date(todayStr()));
    if (days >= 7) {
      insights.push({
        id: "inactive",
        tone: "warning",
        icon: "⏰",
        text: `Você não registra aportes há ${days} dias. Bora colocar o cofre em dia?`,
      });
    }
  }

  // proximidade de um marco redondo
  const milestones = MILESTONE_AMOUNTS.filter((m) => m <= goal);
  if (!milestones.includes(Math.round(goal))) milestones.push(Math.round(goal));
  milestones.sort((a, b) => a - b);
  const next = milestones.find((m) => m > total);
  if (next) {
    const gap = next - total;
    const stepHint = totalCotas ? (goal / totalCotas) * 3 : 0;
    const threshold = Math.max(avgTicket * 1.6, stepHint, 80);
    if (gap > 0 && gap <= threshold) {
      const isGoal = next === Math.round(goal);
      insights.push({
        id: `milestone-${next}`,
        tone: "success",
        icon: "💰",
        text: isGoal
          ? `Falta apenas ${fmtBRL(gap)} para você completar sua meta de ${fmtBRL(goal)}!`
          : `Falta apenas um aporte de ${fmtBRL(gap)} para você completar ${fmtBRL(next)}!`,
      });
    }
  }

  // quase fechando o desafio
  const restantes = totalCotas - count;
  if (restantes > 0 && restantes <= 5) {
    insights.push({
      id: "quase",
      tone: "success",
      icon: "🔥",
      text: `Só ${restantes} aporte${restantes > 1 ? "s" : ""} para fechar o desafio!`,
    });
  }

  return insights;
}

function CofreApp({ onLock, accountName, accountEmail, userId }) {
  const storageKey = `${STORAGE_KEY}:${userId}`;
  const [vaults, setVaults] = useState([]); // [{id, name, challenge, deposits}]
  const [activeVaultId, setActiveVaultId] = useState(null);
  const [tab, setTab] = useState("setup");
  const [activeBlock, setActiveBlock] = useState(0);
  const [selectedSeq, setSelectedSeq] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [toast, setToast] = useState(null);

  const activeVault = vaults.find((v) => v.id === activeVaultId) || null;
  const challenge = activeVault ? activeVault.challenge : null;
  const deposits = activeVault ? activeVault.deposits : {};

  // ---- load / persist ----
  useEffect(() => {
    (async () => {
      try {
        let res = await window.storage.get(storageKey, false);
        if (!res?.value) {
          // migra dado legado (de antes da multiconta) para o primeiro usuário que logar
          const legacy = await window.storage.get(STORAGE_KEY, false);
          if (legacy && legacy.value) {
            res = legacy;
            await window.storage.set(storageKey, legacy.value, false);
            await window.storage.set(STORAGE_KEY, "", false);
          }
        }
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.vaults) {
            setVaults(parsed.vaults);
            if (parsed.activeVaultId) {
              setActiveVaultId(parsed.activeVaultId);
              setTab("cofre");
            }
          } else if (parsed.challenge) {
            // dado legado: um único desafio sem cofres nomeados
            const legacy = {
              id: genId(),
              name: "Cofre 1",
              challenge: parsed.challenge,
              deposits: parsed.deposits || {},
            };
            setVaults([legacy]);
            setActiveVaultId(legacy.id);
            setTab("cofre");
          } else if (parsed.deposits && Object.keys(parsed.deposits).length) {
            // dado legado ainda mais antigo, sem desafio salvo: assume o padrão original
            const legacy = {
              id: genId(),
              name: "Cofre 1",
              challenge: { goal: 125250, totalCotas: 500, lastValue: 500, destino: {} },
              deposits: parsed.deposits,
            };
            setVaults([legacy]);
            setActiveVaultId(legacy.id);
            setTab("cofre");
          }
        }
      } catch (e) {
        // sem dados salvos ainda — segue para a tela inicial
      } finally {
        setLoaded(true);
      }
    })();
  }, [storageKey]);

  const persist = useCallback(
    async (nextVaults, nextActiveVaultId) => {
      try {
        await window.storage.set(
          storageKey,
          JSON.stringify({ vaults: nextVaults, activeVaultId: nextActiveVaultId }),
          false
        );
      } catch (e) {
        console.error("Falha ao salvar progresso", e);
      }
    },
    [storageKey]
  );

  useEffect(() => {
    if (!loaded) return;
    persist(vaults, activeVaultId);
  }, [vaults, activeVaultId, loaded, persist]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function updateActiveVault(updater) {
    setVaults((prev) => prev.map((v) => (v.id === activeVaultId ? updater(v) : v)));
  }

  // ---- cálculos ----
  const entries = useMemo(
    () =>
      Object.entries(deposits).map(([seq, v]) => ({
        seq: Number(seq),
        value: Number(v.value) || 0,
        date: v.date,
      })),
    [deposits]
  );

  const total = useMemo(() => entries.reduce((s, e) => s + e.value, 0), [entries]);
  const count = entries.length;
  const goal = challenge ? challenge.goal : 0;
  const totalCotas = challenge ? challenge.totalCotas : 0;
  const remaining = Math.max(goal - total, 0);
  const pct = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;
  const avgTicket = count > 0 ? total / count : 0;
  const cotasRestantes = Math.max(totalCotas - count, 0);

  const sortedByDate = useMemo(
    () => [...entries].filter((e) => e.date).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [entries]
  );

  const firstDate = sortedByDate[0]?.date;
  const elapsedDays = firstDate ? Math.max(diffDays(new Date(firstDate), new Date(todayStr())), 1) : 0;
  const ratePerDay = elapsedDays > 0 ? total / elapsedDays : 0;
  const daysToFinish = ratePerDay > 0 ? Math.ceil(remaining / ratePerDay) : null;
  const projectedDate =
    daysToFinish != null
      ? new Date(Date.now() + daysToFinish * 86400000).toISOString().slice(0, 10)
      : null;

  const chartData = useMemo(() => {
    let running = 0;
    return sortedByDate.map((e) => {
      running += e.value;
      return { date: fmtDateBR(e.date), iso: e.date, total: running };
    });
  }, [sortedByDate]);

  const monthlyData = useMemo(() => {
    const map = {};
    sortedByDate.forEach((e) => {
      const key = e.date.slice(0, 7);
      map[key] = (map[key] || 0) + e.value;
    });
    return Object.entries(map)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => {
        const [y, m] = k.split("-");
        const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        return { mes: `${meses[Number(m) - 1]}/${y.slice(2)}`, valor: v };
      });
  }, [sortedByDate]);

  const blocks = useMemo(() => (challenge ? buildBlocks(challenge.totalCotas) : []), [challenge]);

  const achievements = useMemo(
    () => getAchievements({ goal, total, pct, count, totalCotas }),
    [goal, total, pct, count, totalCotas]
  );
  const insights = useMemo(
    () => getInsights({ goal, total, count, totalCotas, sortedByDate, avgTicket }),
    [goal, total, count, totalCotas, sortedByDate, avgTicket]
  );

  const prevAchievedRef = useRef(null);
  useEffect(() => {
    if (!loaded || !challenge) return;
    const currentIds = new Set(achievements.filter((a) => a.achieved).map((a) => a.id));
    if (prevAchievedRef.current === null) {
      prevAchievedRef.current = currentIds;
      return;
    }
    const newOnes = [...currentIds].filter((id) => !prevAchievedRef.current.has(id));
    if (newOnes.length) {
      const item = achievements.find((a) => a.id === newOnes[0]);
      if (item) showToast(`🏆 Conquista desbloqueada: ${item.label}`);
    }
    prevAchievedRef.current = currentIds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achievements, loaded, challenge]);

  // ---- ações ----
  function openSeq(seq) {
    setSelectedSeq(seq);
  }
  function closePanel() {
    setSelectedSeq(null);
  }
  function saveDeposit(seq, value, date) {
    updateActiveVault((v) => ({ ...v, deposits: { ...v.deposits, [seq]: { value, date } } }));
    showToast(`Aporte nº${seq} registrado — ${fmtBRL(value)}`);
    closePanel();
  }
  function removeDeposit(seq) {
    updateActiveVault((v) => {
      const next = { ...v.deposits };
      delete next[seq];
      return { ...v, deposits: next };
    });
    showToast(`Aporte nº${seq} removido`);
    closePanel();
  }
  function resetAll() {
    updateActiveVault((v) => ({ ...v, deposits: {} }));
    setConfirmReset(false);
    showToast("Cofre reiniciado");
  }
  function transferToVault(value, date) {
    if (!challenge) return;
    let seq = null;
    for (let i = 1; i <= challenge.totalCotas; i++) {
      if (!deposits[i]) {
        seq = i;
        break;
      }
    }
    if (seq == null) {
      showToast("Esse cofre já está completo! 🎉");
      setShowTransfer(false);
      return;
    }
    updateActiveVault((v) => ({ ...v, deposits: { ...v.deposits, [seq]: { value, date } } }));
    showToast(`Transferência registrada — ${fmtBRL(value)} (aporte nº${seq})`);
    setShowTransfer(false);
  }
  function createVault(name, rawGoal) {
    const c = computeChallenge(rawGoal);
    if (!c) return;
    const vault = { id: genId(), name: name || `Cofre ${vaults.length + 1}`, challenge: c, deposits: {} };
    setVaults((prev) => [...prev, vault]);
    setActiveVaultId(vault.id);
    setActiveBlock(0);
    setTab("cofre");
    showToast(`Cofre "${vault.name}" criado: ${fmtBRL(c.goal)} em ${c.totalCotas} aportes`);
  }
  function renameVault(id, name) {
    setVaults((prev) => prev.map((v) => (v.id === id ? { ...v, name } : v)));
    showToast("Cofre renomeado");
  }
  function deleteVault(id) {
    const vault = vaults.find((v) => v.id === id);
    setVaults((prev) => prev.filter((v) => v.id !== id));
    if (activeVaultId === id) {
      setActiveVaultId(null);
      setTab("setup");
    }
    showToast(vault ? `Cofre "${vault.name}" excluído` : "Cofre excluído");
  }
  function exportCSV() {
    const rows = [["Sequência", "Valor (R$)", "Data"]];
    [...entries]
      .sort((a, b) => a.seq - b.seq)
      .forEach((e) => rows.push([e.seq, e.value.toFixed(2).replace(".", ","), fmtDateBR(e.date)]));
    rows.push([]);
    rows.push(["Total guardado", total.toFixed(2).replace(".", ","), ""]);
    rows.push(["Meta", goal.toFixed(2).replace(".", ","), ""]);
    const csv = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "desafio-relatorio.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Relatório CSV exportado");
  }

  return (
    <div style={S.app}>
      <GlobalStyle />
      {toast && <div style={S.toast}>{toast}</div>}

      <header style={S.header}>
        <div className="no-print" style={S.headerBrand}>
          <Logo size={26} withWordmark />
        </div>
        <div className="no-print" style={S.headerTop}>
          {tab !== "setup" ? (
            <button style={S.backBtn} onClick={() => setTab("setup")}>
              ← Voltar ao início
            </button>
          ) : (
            <span style={S.eyebrow}>COFRE DIGITAL · DESAFIO DE POUPANÇA</span>
          )}
          <AvatarLabelGroup name={accountName} email={accountEmail} onLogout={onLock} />
        </div>
        <h1 style={S.title}>{activeVault && tab !== "setup" ? activeVault.name : "Cofre Digital"}</h1>
        <p style={S.subtitle}>
          {activeVault && tab !== "setup"
            ? `Meta de ${fmtBRL(goal)} · cada número do cofre é um aporte. Preencha os ${totalCotas}, na ordem que quiser, até fechar a meta.`
            : "Crie quantos cofres quiser, dê um nome para cada um e acompanhe o progresso separadamente."}
        </p>
      </header>

      {tab === "setup" && (
        <VaultsHub
          vaults={vaults}
          onSelectVault={(id) => {
            setActiveVaultId(id);
            setActiveBlock(0);
            setTab("cofre");
          }}
          onCreateVault={createVault}
          onRenameVault={renameVault}
          onDeleteVault={deleteVault}
        />
      )}

      {challenge && tab !== "setup" && (
        <>
          <Insights insights={insights} />

          <SummaryBar
            total={total}
            goal={goal}
            remaining={remaining}
            pct={pct}
            count={count}
            totalCotas={totalCotas}
            avgTicket={avgTicket}
            cotasRestantes={cotasRestantes}
            projectedDate={projectedDate}
          />

          <nav className="no-print" style={S.tabs}>
            <button style={S.primaryBtn} onClick={() => setShowTransfer(true)}>
              💸 Transferir
            </button>
            {[
              ["cofre", "Cofre"],
              ["evolucao", "Evolução"],
              ["conquistas", "Conquistas"],
              ["relatorio", "Relatório"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{ ...S.tabBtn, ...(tab === id ? S.tabBtnActive : {}) }}
              >
                {label}
              </button>
            ))}
            <button onClick={() => setConfirmReset(true)} style={S.resetBtn}>
              Reiniciar cofre
            </button>
          </nav>

          {tab === "cofre" && (
            <section key="cofre" className="fade-in">
              <div className="no-print" style={S.blockTabs}>
                {blocks.map((b, i) => {
                  const filled = entries.filter((e) => e.seq >= b.start && e.seq <= b.end).length;
                  return (
                    <button
                      key={b.label}
                      onClick={() => setActiveBlock(i)}
                      style={{
                        ...S.blockBtn,
                        ...(activeBlock === i ? S.blockBtnActive : {}),
                      }}
                    >
                      <span>{b.label}</span>
                      <span style={S.blockBtnCount}>
                        {filled}/{b.end - b.start + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
              <Grid
                block={blocks[activeBlock] || blocks[0]}
                deposits={deposits}
                onOpen={openSeq}
              />
            </section>
          )}

          {tab === "evolucao" && (
            <div key="evolucao" className="fade-in">
              <Evolution chartData={chartData} monthlyData={monthlyData} count={count} />
            </div>
          )}

          {tab === "conquistas" && (
            <div key="conquistas" className="fade-in">
              <Achievements achievements={achievements} />
            </div>
          )}

          {tab === "relatorio" && (
            <div key="relatorio" className="fade-in">
              <Report
                entries={entries}
                total={total}
                goal={goal}
                remaining={remaining}
                count={count}
                avgTicket={avgTicket}
                exportCSV={exportCSV}
              />
            </div>
          )}
        </>
      )}

      {selectedSeq != null && (
        <DepositModal
          seq={selectedSeq}
          existing={deposits[selectedSeq]}
          suggested={suggestedValue(selectedSeq, challenge)}
          onSave={saveDeposit}
          onRemove={removeDeposit}
          onClose={closePanel}
        />
      )}

      {confirmReset && (
        <ConfirmModal
          title="Reiniciar o cofre?"
          message="Isso vai apagar todos os registros do cofre atual. Essa ação não pode ser desfeita."
          confirmLabel="Reiniciar"
          onConfirm={resetAll}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      {showTransfer && challenge && (
        <TransferModal
          suggested={(() => {
            for (let i = 1; i <= challenge.totalCotas; i++) {
              if (!deposits[i]) return suggestedValue(i, challenge);
            }
            return challenge.lastValue;
          })()}
          onSave={transferToVault}
          onClose={() => setShowTransfer(false)}
        />
      )}
    </div>
  );
}

// ----------------------------- login / acesso -----------------------------

const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;

function AuthGate({ children }) {
  const [status, setStatus] = useState("loading"); // loading | auth | unlocked
  const [accounts, setAccounts] = useState([]); // [{id, name, email, hash}]
  const [currentUserId, setCurrentUserId] = useState(null);
  const [error, setError] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const accRes = await window.storage.get(ACCOUNTS_KEY, false);
        const sesRes = localSession.get(SESSION_KEY);
        const legacyRes = localSession.get(AUTH_KEY);
        let accs = accRes && accRes.value ? JSON.parse(accRes.value) : [];

        // migra conta única do esquema antigo (pré multiconta), se existir
        if (accs.length === 0 && legacyRes && legacyRes.value) {
          const legacy = JSON.parse(legacyRes.value);
          if (legacy && legacy.email && legacy.hash) {
            accs = [{ id: genId(), name: legacy.name, email: legacy.email, hash: legacy.hash }];
            await window.storage.set(ACCOUNTS_KEY, JSON.stringify(accs), false);
            localSession.set(AUTH_KEY, "");
          }
        }

        setAccounts(accs);

        if (sesRes && sesRes.value) {
          const session = JSON.parse(sesRes.value);
          const user = accs.find((a) => a.id === session.userId);
          if (user && session.unlockedUntil && session.unlockedUntil > Date.now()) {
            setCurrentUserId(user.id);
            setStatus("unlocked");
            return;
          }
        }
        setStatus("auth");
      } catch (e) {
        setStatus("auth");
      }
    })();
  }, []);

  async function handleSignup(name, email, pw) {
    const normEmail = email.trim().toLowerCase();
    if (accounts.some((a) => a.email === normEmail)) {
      setError("Já existe uma conta com esse e-mail neste navegador.");
      return;
    }
    const hash = await hashPassword(pw);
    const user = { id: genId(), name, email: normEmail, hash };
    const nextAccounts = [...accounts, user];
    await window.storage.set(ACCOUNTS_KEY, JSON.stringify(nextAccounts), false);
    setAccounts(nextAccounts);
    localSession.set(SESSION_KEY, JSON.stringify({ userId: user.id, unlockedUntil: null }));
    setCurrentUserId(user.id);
    setError("");
    setStatus("unlocked");
  }

  async function handleLogin(email, pw, remember) {
    const normEmail = email.trim().toLowerCase();
    const user = accounts.find((a) => a.email === normEmail);
    if (!user) {
      setError("Nenhuma conta encontrada com esse e-mail neste navegador.");
      return;
    }
    const hash = await hashPassword(pw);
    if (hash !== user.hash) {
      setError("Senha incorreta.");
      return;
    }
    const session = { userId: user.id, unlockedUntil: remember ? Date.now() + REMEMBER_MS : null };
    localSession.set(SESSION_KEY, JSON.stringify(session));
    setCurrentUserId(user.id);
    setError("");
    setStatus("unlocked");
  }

  async function handleLock() {
    localSession.set(
      SESSION_KEY,
      JSON.stringify({ userId: currentUserId, unlockedUntil: null })
    );
    setStatus("auth");
  }

  async function handleResetAccount() {
    const normEmail = forgotEmail.trim().toLowerCase();
    const nextAccounts = accounts.filter((a) => a.email !== normEmail);
    await window.storage.set(ACCOUNTS_KEY, JSON.stringify(nextAccounts), false);
    setAccounts(nextAccounts);
    setError("");
    setForgotEmail("");
    setResetConfirm(false);
  }

  if (status === "loading") {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <GlobalStyle />
        <LoadingIndicator type="dot-circle" size="md" label="Carregando seus cofres..." />
      </div>
    );
  }

  if (status === "auth") {
    return (
      <>
        <AuthScreen
          hasAnyAccount={accounts.length > 0}
          error={error}
          onSignup={handleSignup}
          onLogin={handleLogin}
          onForgot={(email) => {
            setForgotEmail(email);
            setResetConfirm(true);
          }}
          clearError={() => setError("")}
        />
        {resetConfirm && (
          <ConfirmModal
            title="Esqueceu sua senha?"
            message={`Isso vai apagar a conta "${forgotEmail}" deste navegador (os cofres dela ficam guardados, mas inacessíveis até você criar essa conta de novo com o mesmo e-mail).`}
            confirmLabel="Apagar conta e recomeçar"
            onConfirm={handleResetAccount}
            onCancel={() => setResetConfirm(false)}
          />
        )}
      </>
    );
  }

  const currentUser = accounts.find((a) => a.id === currentUserId);
  return React.cloneElement(children, {
    onLock: handleLock,
    accountName: currentUser?.name,
    accountEmail: currentUser?.email,
    userId: currentUserId,
  });
}

function AuthScreen({ hasAnyAccount, error, onSignup, onLogin, onForgot, clearError }) {
  const [mode, setMode] = useState(hasAnyAccount ? "login" : "cadastro");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [remember, setRemember] = useState(false);
  const [localError, setLocalError] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next) {
    setMode(next);
    setLocalError("");
    clearError();
    setPw("");
    setPw2("");
  }

  async function handleSubmit() {
    setLocalError("");
    clearError();
    if (mode === "cadastro") {
      if (!name.trim()) return setLocalError("Informe seu nome.");
      if (!email.trim().includes("@")) return setLocalError("Informe um e-mail válido.");
      if (pw.length < 4) return setLocalError("A senha precisa ter pelo menos 4 caracteres.");
      if (pw !== pw2) return setLocalError("As senhas não coincidem.");
      setBusy(true);
      await onSignup(name.trim(), email.trim(), pw);
      setBusy(false);
    } else {
      if (!email.trim()) return setLocalError("Informe seu e-mail.");
      if (!pw) return setLocalError("Informe sua senha.");
      setBusy(true);
      await onLogin(email, pw, remember);
      setBusy(false);
    }
  }

  const shownError = localError || error;

  return (
    <div style={S.app}>
      <GlobalStyle />
      <div style={S.authWrap} className="fade-in">
        <div style={S.authCard}>
          <div style={S.authLogoWrap}>
            <Logo size={48} />
          </div>
          <h2 style={S.authTitle}>
            {mode === "cadastro" ? "Crie sua conta" : "Entrar na sua conta"}
          </h2>
          <p style={S.authSubtitle}>
            {mode === "cadastro"
              ? "Leva menos de um minuto. Cada pessoa pode ter sua própria conta neste navegador, vendo só os próprios cofres."
              : "Bem-vindo de volta! Informe seus dados para abrir os seus cofres."}
          </p>

          <div style={S.authTabs}>
            <button
              type="button"
              style={{ ...S.authTabBtn, ...(mode === "cadastro" ? S.authTabBtnActive : {}) }}
              onClick={() => switchMode("cadastro")}
            >
              Cadastrar
            </button>
            <button
              type="button"
              style={{ ...S.authTabBtn, ...(mode === "login" ? S.authTabBtnActive : {}) }}
              onClick={() => switchMode("login")}
            >
              Entrar
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            {mode === "cadastro" && (
              <>
                <label style={S.fieldLabel}>Nome</label>
                <input
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={S.textInput}
                  placeholder="ex: Danilo"
                  autoFocus
                />
              </>
            )}

            <label style={S.fieldLabel}>E-mail</label>
            <input
              type="email"
              name="email"
              autoComplete={mode === "cadastro" ? "email" : "username"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={S.textInput}
              placeholder="seuemail@exemplo.com"
              autoFocus={mode === "login"}
            />

            <label style={S.fieldLabel}>Senha</label>
            <PasswordInput
              name="password"
              autoComplete={mode === "cadastro" ? "new-password" : "current-password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={mode === "cadastro" ? "mínimo 4 caracteres" : "••••••••"}
            />

            {mode === "cadastro" && (
              <>
                <label style={S.fieldLabel}>Confirmar senha</label>
                <PasswordInput
                  name="confirm-password"
                  autoComplete="new-password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                />
              </>
            )}

            {mode === "login" && (
              <div style={S.authRow}>
                <label style={S.authCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    style={S.authCheckbox}
                  />
                  Lembrar por 30 dias
                </label>
                <button type="button" style={S.authLink} onClick={() => onForgot(email)}>
                  Esqueci minha senha
                </button>
              </div>
            )}

            {shownError && <div style={S.authError}>{shownError}</div>}

            <button
              type="submit"
              style={{ ...S.primaryBtn, ...S.setupSubmit, ...(busy ? S.btnDisabled : {}) }}
              disabled={busy}
            >
              {busy ? "Enviando..." : mode === "cadastro" ? "Criar conta" : "Entrar"}
            </button>
          </form>

          <p style={S.authSwitchText}>
            {mode === "cadastro" ? (
              <>
                Já tem uma conta?{" "}
                <button type="button" style={S.authLink} onClick={() => switchMode("login")}>
                  Entrar
                </button>
              </>
            ) : (
              <>
                Não tem uma conta?{" "}
                <button type="button" style={S.authLink} onClick={() => switchMode("cadastro")}>
                  Cadastre-se
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      <CofreApp />
    </AuthGate>
  );
}

// ----------------------------- tela inicial / cofres -----------------------------

function VaultsHub({ vaults, onSelectVault, onCreateVault, onRenameVault, onDeleteVault }) {
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const preview = computeChallenge(input);

  function handleCreateClick() {
    if (!preview) return;
    onCreateVault(name.trim(), input);
    setInput("");
    setName("");
  }

  return (
    <div style={S.setupWrap} className="fade-in">
      {vaults.length > 0 && (
        <div style={S.vaultsGrid}>
          {vaults.map((v) => {
            const t = Object.values(v.deposits).reduce((s, d) => s + (Number(d.value) || 0), 0);
            const c = Object.keys(v.deposits).length;
            const pct = v.challenge.goal > 0 ? Math.min((t / v.challenge.goal) * 100, 100) : 0;
            return (
              <div key={v.id} style={S.vaultCard} className="hover-card">
                {renamingId === v.id ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      style={{ ...S.textInput, flex: 1 }}
                    />
                    <button
                      style={S.modalSave}
                      onClick={() => {
                        onRenameVault(v.id, renameValue.trim() || v.name);
                        setRenamingId(null);
                      }}
                    >
                      Ok
                    </button>
                  </div>
                ) : (
                  <div style={S.vaultCardHeader}>
                    <div style={S.vaultCardName}>🏦 {v.name}</div>
                    <button
                      style={S.vaultCardIconBtn}
                      onClick={() => {
                        setRenamingId(v.id);
                        setRenameValue(v.name);
                      }}
                      title="Renomear cofre"
                    >
                      ✎
                    </button>
                  </div>
                )}
                <div style={S.vaultCardGoal}>{fmtBRL(v.challenge.goal)}</div>
                <div style={S.vaultCardSub}>
                  {c}/{v.challenge.totalCotas} aportes · {pct.toFixed(0)}% · {fmtBRL(t)} guardado
                </div>
                <div style={S.vaultCardActions}>
                  <button style={S.primaryBtn} onClick={() => onSelectVault(v.id)}>
                    Abrir cofre
                  </button>
                  <button style={S.modalRemove} onClick={() => setDeletingId(v.id)}>
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={S.setupCard}>
        <h2 style={S.setupTitle}>Criar novo cofre</h2>
        <p style={S.setupText}>
          Dê um nome para o cofre e informe quanto você quer guardar nele. O cofre divide essa
          meta em aportes crescentes — R$ 1, R$ 2, R$ 3 e assim por diante — e calcula exatamente
          quantos números você vai precisar preencher para fechar o valor certinho.
        </p>

        <label style={S.fieldLabel}>Nome do cofre</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex: Viagem, Reserva de emergência..."
          style={S.textInput}
        />

        <label style={{ ...S.fieldLabel, marginTop: 14 }}>Valor da meta</label>
        <div style={S.presetRow}>
          {PRESETS.map((p) => (
            <button key={p} style={S.presetChip} onClick={() => setInput(String(p))}>
              {fmtBRL(p)}
            </button>
          ))}
        </div>
        <div style={S.currencyInputWrap}>
          <span style={S.currencyPrefix}>R$</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ex: 30000"
            inputMode="decimal"
            style={S.currencyInput}
          />
        </div>

        {preview && (
          <div style={S.previewBox}>
            <div style={S.previewRow}>
              <span>Aportes necessários</span>
              <strong>{preview.totalCotas} cotas</strong>
            </div>
            <div style={S.previewRow}>
              <span>Valores de</span>
              <strong>R$ 1 até R$ {preview.totalCotas}</strong>
            </div>
            {preview.lastValue !== preview.totalCotas && (
              <div style={S.previewRow}>
                <span>Última cota ajustada</span>
                <strong>{fmtBRL(preview.lastValue)}</strong>
              </div>
            )}
            <div style={S.previewRow}>
              <span>Total ao final</span>
              <strong>{fmtBRL(preview.goal)}</strong>
            </div>
          </div>
        )}

        <button
          style={{ ...S.primaryBtn, ...S.setupSubmit, ...(preview ? {} : S.btnDisabled) }}
          disabled={!preview}
          onClick={handleCreateClick}
        >
          Criar cofre
        </button>
      </div>

      {deletingId && (
        <ConfirmModal
          title="Excluir este cofre?"
          message="Isso vai apagar todos os aportes registrados nesse cofre. Essa ação não pode ser desfeita."
          confirmLabel="Excluir cofre"
          onConfirm={() => {
            onDeleteVault(deletingId);
            setDeletingId(null);
          }}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

function TransferModal({ suggested, onSave, onClose }) {
  const [value, setValue] = useState(String(suggested || ""));
  const [date, setDate] = useState(todayStr());

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalEyebrow}>TRANSFERÊNCIA</div>
        <h3 style={S.modalTitle}>Transferir para o cofre</h3>
        <p style={S.modalText}>
          Registre o valor que você está guardando agora. Sugestão para o próximo aporte:{" "}
          {fmtBRL(suggested)}.
        </p>

        <label style={S.fieldLabel}>Valor</label>
        <div style={S.currencyInputWrap}>
          <span style={S.currencyPrefix}>R$</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            style={S.currencyInput}
            autoFocus
          />
        </div>

        <label style={S.fieldLabel}>Data</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={S.dateInput}
        />

        <div style={S.modalActions}>
          <div style={{ flex: 1 }} />
          <button style={S.modalCancel} onClick={onClose}>
            Cancelar
          </button>
          <button
            style={S.modalSave}
            onClick={() => {
              const v = Number(String(value).replace(",", "."));
              if (v > 0 && date) onSave(v, date);
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------- componentes -----------------------------

function SummaryBar({
  total,
  goal,
  remaining,
  pct,
  count,
  totalCotas,
  avgTicket,
  cotasRestantes,
  projectedDate,
}) {
  return (
    <div style={S.summaryWrap} className="fade-in">
      <div style={S.heroRow}>
        <div>
          <div style={S.heroLabel}>guardado até agora</div>
          <div style={S.heroValue}>{fmtBRL(total)}</div>
        </div>
        <div style={S.heroGoal}>
          <div style={S.heroLabel}>meta</div>
          <div style={S.heroGoalValue}>{fmtBRL(goal)}</div>
        </div>
      </div>

      <div style={S.progressTrack}>
        <div style={{ ...S.progressFill, width: `${pct}%` }} />
        <span style={S.progressLabel}>{pct.toFixed(1)}% da meta</span>
      </div>

      <div style={S.statsGrid}>
        <Stat label="faltam" value={fmtBRL(remaining)} />
        <Stat label="aportes feitos" value={`${count} / ${totalCotas}`} />
        <Stat label="cotas restantes" value={cotasRestantes} />
        <Stat label="ticket médio" value={fmtBRL(avgTicket)} />
        <Stat
          label="previsão de conclusão"
          value={projectedDate ? fmtDateBR(projectedDate) : "—"}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={S.statCard} className="hover-card">
      <div style={S.statLabel}>{label}</div>
      <div style={S.statValue}>{value}</div>
    </div>
  );
}

function Insights({ insights }) {
  if (!insights || insights.length === 0) return null;
  return (
    <div style={S.insightsWrap}>
      {insights.map((ins) => (
        <div
          key={ins.id}
          style={{
            ...S.insightCard,
            ...(ins.tone === "warning" ? S.insightCardWarning : S.insightCardSuccess),
          }}
        >
          <span style={S.insightIcon}>{ins.icon}</span>
          <span>{ins.text}</span>
        </div>
      ))}
    </div>
  );
}

function Achievements({ achievements }) {
  const unlocked = achievements.filter((a) => a.achieved).length;
  return (
    <section style={S.panel}>
      <div style={S.reportHeader}>
        <h3 style={S.panelTitle}>Conquistas</h3>
        <div style={S.achievementsCount}>
          {unlocked}/{achievements.length} troféus
        </div>
      </div>
      <div style={S.achievementsGrid}>
        {achievements.map((a) => (
          <div
            key={a.id}
            style={{ ...S.achievementCard, ...(a.achieved ? S.achievementCardDone : {}) }}
            className="hover-card"
          >
            <div style={{ ...S.achievementIcon, ...(a.achieved ? {} : S.achievementIconLocked) }}>
              {a.achieved ? a.icon : "🔒"}
            </div>
            <div style={S.achievementLabel}>{a.label}</div>
            <div style={S.achievementDesc}>{a.desc}</div>
            {!a.achieved && (
              <div style={S.achievementProgressTrack}>
                <div
                  style={{
                    ...S.achievementProgressFill,
                    width: `${Math.round((a.progress || 0) * 100)}%`,
                  }}
                />
              </div>
            )}
            {a.achieved && <div style={S.achievementDoneTag}>Conquistado</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function Grid({ block, deposits, onOpen }) {
  if (!block) return null;
  const cells = [];
  for (let seq = block.start; seq <= block.end; seq++) {
    const d = deposits[seq];
    cells.push(
      <button
        key={seq}
        onClick={() => onOpen(seq)}
        style={{ ...S.cell, ...(d ? S.cellDone : {}) }}
        title={d ? `R$ ${d.value} em ${fmtDateBR(d.date)}` : `Registrar aporte nº${seq}`}
      >
        {d ? (
          <span style={S.cellStamp}>
            <span style={S.cellStampValue}>{fmtBRL(d.value)}</span>
            <span style={S.cellStampDate}>{fmtDateBR(d.date).slice(0, 5)}</span>
          </span>
        ) : (
          <span style={S.cellNum}>{seq}</span>
        )}
      </button>
    );
  }
  return <div style={S.grid}>{cells}</div>;
}

function DepositModal({ seq, existing, suggested, onSave, onRemove, onClose }) {
  const [value, setValue] = useState(existing ? String(existing.value) : String(suggested));
  const [date, setDate] = useState(existing ? existing.date : todayStr());

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalEyebrow}>APORTE Nº {seq}</div>
        <h3 style={S.modalTitle}>{existing ? "Editar registro" : "Registrar aporte"}</h3>

        <label style={S.fieldLabel}>Valor depositado</label>
        <div style={S.currencyInputWrap}>
          <span style={S.currencyPrefix}>R$</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            style={S.currencyInput}
            autoFocus
          />
        </div>

        <label style={S.fieldLabel}>Data</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={S.dateInput}
        />

        <div style={S.modalActions}>
          {existing && (
            <button style={S.modalRemove} onClick={() => onRemove(seq)}>
              Remover
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button style={S.modalCancel} onClick={onClose}>
            Cancelar
          </button>
          <button
            style={S.modalSave}
            onClick={() => {
              const v = Number(String(value).replace(",", "."));
              if (v > 0 && date) onSave(seq, v, date);
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }) {
  return (
    <div style={S.overlay} onClick={onCancel}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalEyebrow}>ATENÇÃO</div>
        <h3 style={S.modalTitle}>{title}</h3>
        <p style={S.modalText}>{message}</p>
        <div style={S.modalActions}>
          <div style={{ flex: 1 }} />
          <button style={S.modalCancel} onClick={onCancel}>
            Cancelar
          </button>
          <button style={S.modalRemove} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Evolution({ chartData, monthlyData, count }) {
  if (count === 0) {
    return (
      <div style={S.emptyState}>
        <p>Ainda não há aportes registrados.</p>
        <p style={S.emptyStateSub}>Marque o primeiro número no Cofre para começar a curva de evolução.</p>
      </div>
    );
  }
  return (
    <section style={S.panel}>
      <h3 style={S.panelTitle}>Evolução acumulada</h3>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6C63FF" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#6C63FF" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#EAEBF7" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" stroke="#8B90A6" fontSize={11} tickLine={false} axisLine={{ stroke: "#EAEBF7" }} minTickGap={24} />
            <YAxis
              stroke="#8B90A6"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              width={36}
            />
            <Tooltip
              contentStyle={{ background: "#FFFFFF", border: "1px solid #E9EBF6", borderRadius: 14, fontSize: 12, boxShadow: "0 10px 30px rgba(108,99,255,0.18)" }}
              labelStyle={{ color: "#6C63FF" }}
              formatter={(v) => [fmtBRL(v), "Acumulado"]}
            />
            <Area type="monotone" dataKey="total" stroke="#6C63FF" strokeWidth={2} fill="url(#fillTotal)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <h3 style={{ ...S.panelTitle, marginTop: 32 }}>Aportes por mês</h3>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={monthlyData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#EAEBF7" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mes" stroke="#8B90A6" fontSize={11} tickLine={false} axisLine={{ stroke: "#EAEBF7" }} />
            <YAxis stroke="#8B90A6" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={36} />
            <Tooltip
              contentStyle={{ background: "#FFFFFF", border: "1px solid #E9EBF6", borderRadius: 14, fontSize: 12, boxShadow: "0 10px 30px rgba(52,199,89,0.18)" }}
              labelStyle={{ color: "#34C759" }}
              formatter={(v) => [fmtBRL(v), "Guardado no mês"]}
            />
            <Bar dataKey="valor" fill="#34C759" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Report({ entries, total, goal, remaining, count, avgTicket, exportCSV }) {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  return (
    <section style={S.panel}>
      <div style={S.reportHeader}>
        <h3 style={S.panelTitle}>Relatório de acompanhamento</h3>
        <div className="no-print" style={S.reportActions}>
          <button style={S.secondaryBtn} onClick={exportCSV}>
            Exportar CSV
          </button>
          <button style={S.primaryBtn} onClick={() => window.print()}>
            Imprimir
          </button>
        </div>
      </div>

      <div style={S.reportTotals}>
        <Stat label="total guardado" value={fmtBRL(total)} />
        <Stat label="meta" value={fmtBRL(goal)} />
        <Stat label="faltam" value={fmtBRL(remaining)} />
        <Stat label="aportes" value={`${count}`} />
        <Stat label="ticket médio" value={fmtBRL(avgTicket)} />
      </div>

      {sorted.length === 0 ? (
        <div style={S.emptyState}>
          <p>Nenhum aporte registrado ainda.</p>
        </div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Seq.</th>
                <th style={S.th}>Valor</th>
                <th style={S.th}>Data</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.seq}>
                  <td style={S.td}>{e.seq}</td>
                  <td style={S.td}>{fmtBRL(e.value)}</td>
                  <td style={S.td}>{fmtDateBR(e.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Logo({ size = 32, withWordmark = false }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        <defs>
          <linearGradient id="logoShieldGrad" x1="6" y1="4" x2="58" y2="60">
            <stop offset="0%" stopColor="#1E3FCB" />
            <stop offset="100%" stopColor="#5AA8FF" />
          </linearGradient>
        </defs>
        <path
          d="M32 4 H46 C50.4 4 54 7.6 54 12 V30 C54 44 44 54 32 60 C20 54 10 44 10 30 V12 C10 7.6 13.6 4 18 4 H32 Z"
          fill="url(#logoShieldGrad)"
        />
        <path
          d="M32 16 L46 30 H38 V44 H26 V30 H18 Z"
          fill="#FFFFFF"
        />
      </svg>
      {withWordmark && <span style={S.logoWordmark}>FinVault</span>}
    </div>
  );
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function EyeIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M2.42012 12.7132C2.28394 12.4975 2.21584 12.3897 2.17772 12.2234C2.14909 12.0985 2.14909 11.9015 2.17772 11.7766C2.21584 11.6103 2.28394 11.5025 2.42012 11.2868C3.54553 9.50484 6.8954 5 12.0004 5C17.1054 5 20.4553 9.50484 21.5807 11.2868C21.7169 11.5025 21.785 11.6103 21.8231 11.7766C21.8517 11.9015 21.8517 12.0985 21.8231 12.2234C21.785 12.3897 21.7169 12.4975 21.5807 12.7132C20.4553 14.4952 17.1054 19 12.0004 19C6.8954 19 3.54553 14.4952 2.42012 12.7132Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.0004 15C13.6573 15 15.0004 13.6569 15.0004 12C15.0004 10.3431 13.6573 9 12.0004 9C10.3435 9 9.0004 10.3431 9.0004 12C9.0004 13.6569 10.3435 15 12.0004 15Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeOffIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M2.42012 12.7132C2.28394 12.4975 2.21584 12.3897 2.17772 12.2234C2.14909 12.0985 2.14909 11.9015 2.17772 11.7766C2.21584 11.6103 2.28394 11.5025 2.42012 11.2868C3.54553 9.50484 6.8954 5 12.0004 5C17.1054 5 20.4553 9.50484 21.5807 11.2868C21.7169 11.5025 21.785 11.6103 21.8231 11.7766C21.8517 11.9015 21.8517 12.0985 21.8231 12.2234C21.785 12.3897 21.7169 12.4975 21.5807 12.7132C20.4553 14.4952 17.1054 19 12.0004 19C6.8954 19 3.54553 14.4952 2.42012 12.7132Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.0004 15C13.6573 15 15.0004 13.6569 15.0004 12C15.0004 10.3431 13.6573 9 12.0004 9C10.3435 9 9.0004 10.3431 9.0004 12C9.0004 13.6569 10.3435 15 12.0004 15Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 3L21 21" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function PasswordInput({ value, onChange, placeholder, onKeyDown, name, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={S.passwordWrap}>
      <input
        type={visible ? "text" : "password"}
        name={name}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        style={S.passwordInput}
        placeholder={placeholder}
      />
      <button
        type="button"
        style={S.passwordToggle}
        onClick={() => setVisible((v) => !v)}
        title={visible ? "Ocultar senha" : "Mostrar senha"}
        tabIndex={-1}
      >
        {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </div>
  );
}

function AvatarLabelGroup({ name, email, onLogout }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  return (
    <div style={S.avatarMenuWrap} ref={wrapRef}>
      <button
        style={S.avatarGroup}
        onClick={() => setOpen((o) => !o)}
        title="Opções da conta"
      >
        <span style={S.avatarCircle}>{initials(name)}</span>
        <span style={S.avatarLabels}>
          <span style={S.avatarName}>{name || "Conta"}</span>
          {email && <span style={S.avatarEmail}>{email}</span>}
        </span>
      </button>
      {open && (
        <div style={S.avatarDropdown}>
          <button
            style={S.avatarDropdownItem}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            🚪 Sair do sistema
          </button>
        </div>
      )}
    </div>
  );
}

const LOADING_SIZES = {
  sm: { box: 32, dot: 5, radius: 11, font: 12 },
  md: { box: 44, dot: 6, radius: 16, font: 13.5 },
  lg: { box: 56, dot: 7, radius: 20, font: 15 },
};

function LoadingIndicator({ type = "dot-circle", size = "md", label }) {
  const dims = LOADING_SIZES[size] || LOADING_SIZES.md;

  let indicator;
  if (type === "line-simple") {
    indicator = (
      <div style={{ ...S.loadingLine, width: dims.box * 2 }}>
        <div style={S.loadingLineFill} />
      </div>
    );
  } else if (type === "dot-circle") {
    indicator = (
      <div style={{ width: dims.box, height: dims.box, position: "relative" }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * 2 * Math.PI;
          const x = dims.box / 2 + dims.radius * Math.cos(angle) - dims.dot / 2;
          const y = dims.box / 2 + dims.radius * Math.sin(angle) - dims.dot / 2;
          return (
            <div
              key={i}
              style={{
                ...S.loadingDot,
                width: dims.dot,
                height: dims.dot,
                left: x,
                top: y,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          );
        })}
      </div>
    );
  } else {
    // line-spinner (padrão)
    indicator = (
      <div style={{ ...S.spinner, width: dims.box, height: dims.box }} />
    );
  }

  return (
    <div style={S.loadingWrap}>
      {indicator}
      {label && <div style={{ ...S.loadingLabel, fontSize: dims.font }}>{label}</div>}
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      * { box-sizing: border-box; }
      html, body { -webkit-text-size-adjust: 100%; }
      body {
        padding: env(safe-area-inset-top) env(safe-area-inset-right)
          env(safe-area-inset-bottom) env(safe-area-inset-left);
      }
      ::selection { background: #6C63FF; color: #FFFFFF; }
      select { appearance: none; cursor: pointer; }

      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #D9D9F5; border-radius: 999px; }
      ::-webkit-scrollbar-thumb:hover { background: #C2C2EE; }

      button {
        transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease,
          background 0.15s ease, border-color 0.15s ease;
      }
      button:not(:disabled):hover { transform: translateY(-1px); }
      button:not(:disabled):active { transform: translateY(0) scale(0.97); }

      input, select, textarea {
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      input:focus, select:focus, textarea:focus {
        border-color: #6C63FF !important;
        box-shadow: 0 0 0 3px rgba(108,99,255,0.15) !important;
      }

      .hover-card {
        transition: transform 0.18s ease, box-shadow 0.18s ease;
      }
      .hover-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 16px 36px rgba(108,99,255,0.16);
      }

      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .fade-in { animation: fadeInUp 0.28s ease; }

      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes dotPulse {
        0%, 100% { opacity: 0.25; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1.15); }
      }
      @keyframes lineSlide {
        0% { left: -40%; }
        100% { left: 100%; }
      }

      @media print {
        .no-print { display: none !important; }
        body { background: #fff !important; }
      }
    `}</style>
  );
}

// ----------------------------- estilos -----------------------------

const FONT_DISPLAY =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif";
const FONT_BODY = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif";
const FONT_MONO = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif";

const COL = {
  bg: "#EEF1FB",
  panel: "#FFFFFF",
  panel2: "#F5F6FC",
  border: "#E9EBF6",
  text: "#1B1E2B",
  textDim: "#8B90A6",
  gold: "#6C63FF",
  green: "#34C759",
  greenDim: "#D7F4DF",
  danger: "#FF3B30",
};

const CARD_SHADOW = "0 10px 30px rgba(108,99,255,0.10), 0 2px 8px rgba(16,24,40,0.04)";

const S = {
  app: {
    minHeight: "100vh",
    background: `linear-gradient(160deg, #E6E9FB 0%, ${COL.bg} 45%, #F7F8FD 100%)`,
    color: COL.text,
    fontFamily: FONT_BODY,
    padding: "32px 20px 64px",
  },
  toast: {
    position: "fixed",
    top: 18,
    right: 18,
    zIndex: 100,
    background: COL.green,
    color: "#FFFFFF",
    padding: "10px 16px",
    borderRadius: 18,
    fontSize: 13,
    fontWeight: 600,
    boxShadow: "0 10px 28px rgba(52,199,89,0.35)",
  },
  spinner: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: `3px solid ${COL.border}`,
    borderTopColor: COL.gold,
    animation: "spin 0.7s linear infinite",
  },
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
  },
  loadingLabel: { color: COL.textDim, fontWeight: 600 },
  loadingDot: {
    position: "absolute",
    borderRadius: "50%",
    background: COL.gold,
    animation: "dotPulse 1s ease-in-out infinite",
  },
  loadingLine: {
    height: 4,
    borderRadius: 999,
    background: COL.border,
    overflow: "hidden",
    position: "relative",
  },
  loadingLineFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "40%",
    borderRadius: 999,
    background: COL.gold,
    animation: "lineSlide 1.2s ease-in-out infinite",
  },
  header: { maxWidth: 980, margin: "0 auto 28px" },
  headerBrand: { marginBottom: 14 },
  headerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    minHeight: 28,
  },
  eyebrow: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    letterSpacing: "0.16em",
    color: COL.gold,
  },
  backBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    border: `1px solid ${COL.border}`,
    color: COL.text,
    fontFamily: FONT_MONO,
    fontSize: 12,
    letterSpacing: "0.04em",
    padding: "7px 14px",
    borderRadius: 999,
    cursor: "pointer",
  },
  avatarGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    background: "transparent",
    border: `1px solid ${COL.border}`,
    borderRadius: 999,
    padding: "5px 14px 5px 5px",
    cursor: "pointer",
  },
  avatarCircle: {
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: "50%",
    background: `linear-gradient(160deg, ${COL.gold}, #8B7CFF)`,
    color: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
  },
  avatarLabels: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    lineHeight: 1.2,
  },
  avatarName: { fontSize: 12.5, fontWeight: 600, color: COL.text },
  avatarEmail: { fontSize: 11, color: COL.textDim },
  avatarMenuWrap: { position: "relative", display: "inline-block" },
  avatarDropdown: {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    minWidth: 180,
    background: COL.panel,
    border: `1px solid ${COL.border}`,
    borderRadius: 14,
    boxShadow: CARD_SHADOW,
    padding: 6,
    zIndex: 50,
  },
  avatarDropdownItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "transparent",
    border: "none",
    color: COL.danger,
    fontSize: 13,
    fontWeight: 600,
    padding: "9px 10px",
    borderRadius: 8,
    cursor: "pointer",
    textAlign: "left",
  },

  logoWordmark: {
    fontFamily: FONT_DISPLAY,
    fontWeight: 800,
    fontSize: 18,
    letterSpacing: "-0.01em",
    background: "linear-gradient(135deg, #1E3FCB, #5AA8FF)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },

  title: {
    fontFamily: FONT_DISPLAY,
    fontWeight: 600,
    fontSize: "clamp(32px, 5vw, 48px)",
    margin: "0 0 8px",
    lineHeight: 1.05,
  },
  subtitle: { color: COL.textDim, fontSize: 15, maxWidth: 560, lineHeight: 1.5, margin: 0 },

  // ---- login / acesso ----
  authWrap: {
    width: "100%",
    maxWidth: 420,
    margin: "8vh auto 0",
  },
  authCard: {
    background: COL.panel,
    border: `1px solid ${COL.border}`,
    boxShadow: CARD_SHADOW,
    borderRadius: 24,
    padding: "36px 32px",
  },
  authLogoWrap: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 18,
    filter: "drop-shadow(0 8px 16px rgba(30,63,203,0.3))",
  },
  authTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 24,
    fontWeight: 700,
    margin: "0 0 8px",
    textAlign: "center",
  },
  authSubtitle: {
    color: COL.textDim,
    fontSize: 13.5,
    lineHeight: 1.5,
    margin: "0 0 22px",
    textAlign: "center",
  },
  authTabs: {
    display: "flex",
    background: COL.panel2,
    border: `1px solid ${COL.border}`,
    borderRadius: 14,
    padding: 4,
    marginBottom: 18,
  },
  authTabBtn: {
    flex: 1,
    background: "transparent",
    border: "none",
    color: COL.textDim,
    padding: "9px 0",
    borderRadius: 11,
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  authTabBtnActive: {
    background: COL.panel,
    color: COL.text,
    boxShadow: "0 2px 8px rgba(16,24,40,0.08)",
  },
  authRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    textAlign: "left",
  },
  authCheckboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: COL.textDim,
    cursor: "pointer",
  },
  authCheckbox: { width: 15, height: 15, accentColor: COL.gold, cursor: "pointer" },
  authError: { color: COL.danger, fontSize: 13, marginTop: 14, fontWeight: 600, textAlign: "left" },
  authLink: {
    background: "transparent",
    border: "none",
    color: COL.gold,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    padding: 0,
  },
  authSwitchText: {
    color: COL.textDim,
    fontSize: 13,
    marginTop: 18,
    marginBottom: 0,
    textAlign: "center",
  },
  // ---- setup screen ----
  setupWrap: { maxWidth: 640, margin: "0 auto" },
  setupCurrent: {
    background: COL.panel,
    border: `1px solid ${COL.border}`,
    boxShadow: CARD_SHADOW,
    borderRadius: 22,
    padding: "18px 22px",
    marginBottom: 18,
  },
  setupCurrentLabel: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: COL.gold,
    marginBottom: 8,
  },
  setupCurrentRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  setupCurrentGoal: { fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700 },
  setupCurrentSub: { color: COL.textDim, fontSize: 13, marginTop: 2 },

  setupCard: {
    background: COL.panel,
    border: `1px solid ${COL.border}`,
    boxShadow: CARD_SHADOW,
    borderRadius: 22,
    padding: 28,
  },

  vaultsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    marginBottom: 22,
  },
  vaultCard: {
    background: COL.panel,
    border: `1px solid ${COL.border}`,
    boxShadow: CARD_SHADOW,
    borderRadius: 22,
    padding: "18px 18px 16px",
  },
  vaultCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  vaultCardName: { fontWeight: 700, fontSize: 15 },
  vaultCardIconBtn: {
    background: "transparent",
    border: "none",
    color: COL.textDim,
    cursor: "pointer",
    fontSize: 14,
    padding: 4,
  },
  vaultCardGoal: {
    fontFamily: FONT_DISPLAY,
    fontSize: 24,
    fontWeight: 700,
    color: COL.gold,
    marginTop: 8,
  },
  vaultCardSub: { color: COL.textDim, fontSize: 12.5, marginTop: 4 },
  vaultCardActions: { display: "flex", gap: 8, marginTop: 16 },
  setupTitle: { fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 600, margin: "0 0 10px" },
  setupText: { color: COL.textDim, fontSize: 14, lineHeight: 1.55, margin: "0 0 20px" },

  presetRow: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  presetChip: {
    background: COL.panel2,
    border: `1px solid ${COL.border}`,
    color: COL.text,
    padding: "8px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontFamily: FONT_MONO,
    cursor: "pointer",
  },

  previewBox: {
    marginTop: 16,
    background: COL.panel2,
    border: `1px solid ${COL.gold}`,
    borderRadius: 18,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  previewRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13.5,
    color: COL.textDim,
  },
  setupSubmit: { width: "100%", marginTop: 20, padding: "13px 16px", fontSize: 14 },
  btnDisabled: { opacity: 0.4, cursor: "not-allowed" },

  summaryWrap: {
    maxWidth: 980,
    margin: "0 auto 24px",
    background: COL.panel,
    border: `1px solid ${COL.border}`,
    boxShadow: CARD_SHADOW,
    borderRadius: 22,
    padding: "24px 24px 20px",
  },
  heroRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 18,
  },
  heroLabel: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: COL.textDim,
    marginBottom: 4,
  },
  heroValue: {
    fontFamily: FONT_DISPLAY,
    fontSize: "clamp(34px, 6vw, 56px)",
    fontWeight: 700,
    color: COL.gold,
    lineHeight: 1,
  },
  heroGoal: { textAlign: "right" },
  heroGoalValue: { fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, color: COL.text },

  progressTrack: {
    position: "relative",
    height: 14,
    background: COL.panel2,
    borderRadius: 999,
    overflow: "hidden",
    border: `1px solid ${COL.border}`,
    marginBottom: 18,
  },
  progressFill: {
    height: "100%",
    background: `linear-gradient(90deg, ${COL.greenDim}, ${COL.green}, ${COL.gold})`,
    transition: "width 0.4s ease",
  },
  progressLabel: {
    position: "absolute",
    right: 10,
    top: -20,
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: COL.textDim,
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 10,
  },
  statCard: {
    background: COL.panel2,
    border: `1px solid ${COL.border}`,
    boxShadow: "0 4px 14px rgba(108,99,255,0.06)",
    borderRadius: 16,
    padding: "10px 12px",
  },
  statLabel: {
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: COL.textDim,
    marginBottom: 4,
  },
  statValue: { fontSize: 16, fontWeight: 700, color: COL.text },

  tabs: {
    maxWidth: 980,
    margin: "0 auto 16px",
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  tabBtn: {
    background: "transparent",
    border: `1px solid ${COL.border}`,
    color: COL.textDim,
    padding: "9px 16px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  tabBtnActive: {
    background: COL.green,
    borderColor: COL.green,
    color: "#EAF6EE",
  },
  resetBtn: {
    marginLeft: "auto",
    background: "transparent",
    border: `1px solid ${COL.border}`,
    color: COL.danger,
    padding: "9px 14px",
    borderRadius: 999,
    fontSize: 12.5,
    cursor: "pointer",
  },

  blockTabs: {
    maxWidth: 980,
    margin: "0 auto 14px",
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  blockBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    background: COL.panel,
    border: `1px solid ${COL.border}`,
    color: COL.text,
    padding: "8px 14px",
    borderRadius: 16,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    minWidth: 92,
  },
  blockBtnActive: { borderColor: COL.gold, boxShadow: `0 0 0 1px ${COL.gold} inset` },
  blockBtnCount: { fontFamily: FONT_MONO, fontSize: 11, color: COL.textDim },

  grid: {
    maxWidth: 980,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(10, 1fr)",
    gap: 6,
  },
  cell: {
    aspectRatio: "1 / 1",
    background: COL.panel2,
    border: `1px solid ${COL.border}`,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: COL.textDim,
    fontFamily: FONT_MONO,
    fontSize: 12,
    padding: 2,
    transition: "transform 0.12s ease, border-color 0.12s ease",
  },
  cellDone: {
    background: `linear-gradient(160deg, rgba(108,99,255,0.16), rgba(108,99,255,0.04))`,
    borderColor: COL.gold,
    color: COL.gold,
  },
  cellNum: { fontSize: 12 },
  cellStamp: { display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15 },
  cellStampValue: { fontSize: 10, fontWeight: 700 },
  cellStampDate: { fontSize: 8.5, color: COL.textDim },

  panel: {
    maxWidth: 980,
    margin: "0 auto",
    background: COL.panel,
    border: `1px solid ${COL.border}`,
    boxShadow: CARD_SHADOW,
    borderRadius: 22,
    padding: 24,
  },
  panelTitle: { fontFamily: FONT_DISPLAY, fontSize: 20, margin: "0 0 14px", fontWeight: 600 },

  emptyState: {
    maxWidth: 980,
    margin: "0 auto",
    textAlign: "center",
    color: COL.textDim,
    padding: "48px 12px",
  },
  emptyStateSub: { fontSize: 13, marginTop: 6 },

  reportHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 6,
  },
  reportActions: { display: "flex", gap: 8 },
  primaryBtn: {
    background: COL.gold,
    color: "#FFFFFF",
    border: "none",
    borderRadius: 14,
    padding: "9px 16px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  secondaryBtn: {
    background: "transparent",
    border: `1px solid ${COL.border}`,
    color: COL.text,
    borderRadius: 14,
    padding: "9px 16px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  reportTotals: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 10,
    margin: "16px 0 22px",
  },
  tableWrap: {
    overflowX: "auto",
    border: `1px solid ${COL.border}`,
    boxShadow: CARD_SHADOW,
    borderRadius: 16,
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: "10px 14px",
    background: COL.panel2,
    color: COL.textDim,
    fontFamily: FONT_MONO,
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    borderBottom: `1px solid ${COL.border}`,
  },
  td: { padding: "9px 14px", borderBottom: `1px solid ${COL.border}` },

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(27,30,43,0.32)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
    padding: 16,
  },
  modal: {
    width: "100%",
    maxWidth: 380,
    background: COL.panel,
    border: `1px solid ${COL.border}`,
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 24px 60px rgba(27,30,43,0.22)",
  },
  modalEyebrow: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    letterSpacing: "0.12em",
    color: COL.gold,
    marginBottom: 6,
  },
  modalTitle: { fontFamily: FONT_DISPLAY, fontSize: 22, margin: "0 0 16px", fontWeight: 600 },
  modalText: { color: COL.textDim, fontSize: 13.5, lineHeight: 1.5 },
  fieldLabel: {
    display: "block",
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: COL.textDim,
    marginBottom: 6,
    marginTop: 14,
  },
  fieldOptional: {
    color: COL.textDim,
    fontWeight: 400,
    textTransform: "none",
    letterSpacing: 0,
  },
  textInput: {
    width: "100%",
    background: COL.panel2,
    border: `1px solid ${COL.border}`,
    borderRadius: 16,
    padding: "10px 12px",
    color: COL.text,
    fontSize: 16,
    fontFamily: FONT_BODY,
    outline: "none",
  },
  passwordWrap: { position: "relative", width: "100%" },
  passwordInput: {
    width: "100%",
    background: COL.panel2,
    border: `1px solid ${COL.border}`,
    borderRadius: 16,
    padding: "10px 40px 10px 12px",
    color: COL.text,
    fontSize: 16,
    fontFamily: FONT_BODY,
    outline: "none",
  },
  passwordToggle: {
    position: "absolute",
    right: 6,
    top: "50%",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: COL.textDim,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },

  // ---- notificações inteligentes ----
  insightsWrap: {
    maxWidth: 980,
    margin: "0 auto 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  insightCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 16px",
    borderRadius: 16,
    fontSize: 13.5,
    border: `1px solid ${COL.border}`,
    boxShadow: "0 4px 14px rgba(108,99,255,0.06)",
    background: COL.panel,
  },
  insightCardSuccess: {
    borderColor: COL.gold,
    background: "linear-gradient(90deg, rgba(108,99,255,0.10), transparent)",
  },
  insightCardWarning: {
    borderColor: COL.danger,
    background: "linear-gradient(90deg, rgba(255,59,48,0.10), transparent)",
  },
  insightIcon: { fontSize: 16 },

  // ---- conquistas ----
  achievementsCount: {
    fontFamily: FONT_MONO,
    fontSize: 12,
    color: COL.gold,
    background: COL.panel2,
    border: `1px solid ${COL.border}`,
    borderRadius: 999,
    padding: "6px 12px",
  },
  achievementsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
  },
  achievementCard: {
    position: "relative",
    background: COL.panel,
    border: `1px solid ${COL.border}`,
    boxShadow: "0 4px 14px rgba(108,99,255,0.06)",
    borderRadius: 18,
    padding: "18px 16px 16px",
    opacity: 0.6,
  },
  achievementCardDone: {
    opacity: 1,
    borderColor: COL.gold,
    boxShadow: `0 0 0 1px ${COL.gold} inset, 0 10px 26px rgba(108,99,255,0.18)`,
    background: "linear-gradient(160deg, rgba(108,99,255,0.10), #ffffff)",
  },
  achievementIcon: { fontSize: 30, marginBottom: 8 },
  achievementIconLocked: { filter: "grayscale(1)", opacity: 0.5 },
  achievementLabel: { fontWeight: 700, fontSize: 14.5, marginBottom: 4 },
  achievementDesc: { fontSize: 12.5, color: COL.textDim, lineHeight: 1.4 },
  achievementProgressTrack: {
    marginTop: 12,
    height: 6,
    borderRadius: 999,
    background: COL.border,
    overflow: "hidden",
  },
  achievementProgressFill: {
    height: "100%",
    background: COL.gold,
    transition: "width 0.4s ease",
  },
  achievementDoneTag: {
    marginTop: 12,
    display: "inline-block",
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#FFFFFF",
    background: COL.gold,
    borderRadius: 999,
    padding: "3px 10px",
  },

  currencyInputWrap: {
    display: "flex",
    alignItems: "center",
    background: COL.panel2,
    border: `1px solid ${COL.border}`,
    borderRadius: 16,
    padding: "0 12px",
  },
  currencyPrefix: { color: COL.textDim, fontFamily: FONT_MONO, fontSize: 14, marginRight: 6 },
  currencyInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: COL.text,
    fontSize: 16,
    padding: "10px 0",
    fontFamily: FONT_MONO,
  },
  dateInput: {
    width: "100%",
    background: COL.panel2,
    border: `1px solid ${COL.border}`,
    borderRadius: 16,
    padding: "10px 12px",
    color: COL.text,
    fontFamily: FONT_MONO,
    fontSize: 14,
    outline: "none",
  },
  modalActions: { display: "flex", gap: 8, marginTop: 22, alignItems: "center" },
  modalCancel: {
    background: "transparent",
    border: `1px solid ${COL.border}`,
    color: COL.textDim,
    borderRadius: 14,
    padding: "9px 16px",
    fontSize: 13,
    cursor: "pointer",
  },
  modalSave: {
    background: COL.gold,
    color: "#FFFFFF",
    border: "none",
    borderRadius: 14,
    padding: "9px 18px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  modalRemove: {
    background: "transparent",
    border: `1px solid ${COL.danger}`,
    color: COL.danger,
    borderRadius: 14,
    padding: "9px 16px",
    fontSize: 13,
    cursor: "pointer",
  },
};
