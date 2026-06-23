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

const STORAGE_KEY = "desafio125:data";
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

export default function App() {
  const [challenge, setChallenge] = useState(null); // {goal, totalCotas, lastValue}
  const [deposits, setDeposits] = useState({});
  const [tab, setTab] = useState("setup");
  const [activeBlock, setActiveBlock] = useState(0);
  const [selectedSeq, setSelectedSeq] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [editDestino, setEditDestino] = useState(false);
  const [toast, setToast] = useState(null);

  // ---- load / persist ----
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.deposits) setDeposits(parsed.deposits);
          if (parsed.challenge) {
            setChallenge(parsed.challenge);
            setTab("cofre");
          } else if (parsed.deposits && Object.keys(parsed.deposits).length) {
            // dado legado sem desafio salvo: assume o padrão original
            const legacy = { goal: 125250, totalCotas: 500, lastValue: 500, destino: {} };
            setChallenge(legacy);
            setTab("cofre");
          }
        }
      } catch (e) {
        // sem dados salvos ainda — segue para a tela inicial
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback(async (nextDeposits, nextChallenge) => {
    try {
      await window.storage.set(
        STORAGE_KEY,
        JSON.stringify({ deposits: nextDeposits, challenge: nextChallenge }),
        false
      );
    } catch (e) {
      console.error("Falha ao salvar progresso", e);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    persist(deposits, challenge);
  }, [deposits, challenge, loaded, persist]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
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
    setDeposits((prev) => ({ ...prev, [seq]: { value, date } }));
    showToast(`Aporte nº${seq} registrado — ${fmtBRL(value)}`);
    closePanel();
  }
  function removeDeposit(seq) {
    setDeposits((prev) => {
      const next = { ...prev };
      delete next[seq];
      return next;
    });
    showToast(`Aporte nº${seq} removido`);
    closePanel();
  }
  function resetAll() {
    setDeposits({});
    setConfirmReset(false);
    showToast("Cofre reiniciado");
  }
  function startChallenge(rawGoal, destino) {
    const c = computeChallenge(rawGoal);
    if (!c) return;
    c.destino = destino || { banco: "", chave: "", obs: "" };
    setChallenge(c);
    setDeposits({});
    setActiveBlock(0);
    setTab("cofre");
    showToast(`Novo desafio criado: ${fmtBRL(c.goal)} em ${c.totalCotas} aportes`);
  }
  function updateDestino(destino) {
    setChallenge((prev) => (prev ? { ...prev, destino } : prev));
    setEditDestino(false);
    showToast("Destino do dinheiro atualizado");
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
        <div className="no-print" style={S.headerTop}>
          {tab !== "setup" ? (
            <button style={S.backBtn} onClick={() => setTab("setup")}>
              ← Voltar ao início
            </button>
          ) : (
            <span style={S.eyebrow}>COFRE DIGITAL · DESAFIO DE POUPANÇA</span>
          )}
        </div>
        <h1 style={S.title}>
          {challenge && tab !== "setup" ? `Desafio dos ${fmtBRL(goal)}` : "Cofre Digital"}
        </h1>
        <p style={S.subtitle}>
          {challenge && tab !== "setup"
            ? `Cada número do cofre é um aporte. Preencha os ${totalCotas}, na ordem que quiser, até fechar a meta.`
            : "Escolha um valor e descubra quantos aportes você precisa fazer para chegar lá."}
        </p>
      </header>

      {tab === "setup" && (
        <Setup
          challenge={challenge}
          count={count}
          total={total}
          goal={goal}
          pct={pct}
          onContinue={() => setTab("cofre")}
          onCreate={startChallenge}
          onUpdateDestino={updateDestino}
        />
      )}

      {challenge && tab !== "setup" && (
        <>
          <DestinoBadge destino={challenge.destino} onEdit={() => setEditDestino(true)} />

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
            <section>
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
            <Evolution chartData={chartData} monthlyData={monthlyData} count={count} />
          )}

          {tab === "conquistas" && <Achievements achievements={achievements} />}

          {tab === "relatorio" && (
            <Report
              entries={entries}
              total={total}
              goal={goal}
              remaining={remaining}
              count={count}
              avgTicket={avgTicket}
              exportCSV={exportCSV}
            />
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

      {editDestino && challenge && (
        <DestinoModal
          destino={challenge.destino}
          onSave={updateDestino}
          onClose={() => setEditDestino(false)}
        />
      )}
    </div>
  );
}

// ----------------------------- tela inicial / setup -----------------------------

function Setup({ challenge, count, total, goal, pct, onContinue, onCreate, onUpdateDestino }) {
  const [input, setInput] = useState("");
  const [pendingGoal, setPendingGoal] = useState(null);
  const [banco, setBanco] = useState("");
  const [chave, setChave] = useState("");
  const [obs, setObs] = useState("");
  const [editingDestino, setEditingDestino] = useState(false);

  const preview = computeChallenge(input);

  function handleCreateClick(value) {
    const destino = { banco, chave, obs };
    if (challenge && count > 0) {
      setPendingGoal({ value, destino });
    } else {
      onCreate(value, destino);
    }
  }

  return (
    <div style={S.setupWrap}>
      {challenge && (
        <div style={S.setupCurrent}>
          <div style={S.setupCurrentLabel}>Seu desafio atual</div>
          <div style={S.setupCurrentRow}>
            <div>
              <div style={S.setupCurrentGoal}>{fmtBRL(goal)}</div>
              <div style={S.setupCurrentSub}>
                {count}/{challenge.totalCotas} aportes feitos · {pct.toFixed(1)}% concluído ·{" "}
                {fmtBRL(total)} guardado
              </div>
            </div>
            <button style={S.primaryBtn} onClick={onContinue}>
              Continuar desafio
            </button>
          </div>

          <div style={S.setupDestinoDivider} />

          {editingDestino ? (
            <DestinoFields
              banco={challenge.destino?.banco}
              chave={challenge.destino?.chave}
              obs={challenge.destino?.obs}
              onSave={(d) => {
                onUpdateDestino(d);
                setEditingDestino(false);
              }}
              onCancel={() => setEditingDestino(false)}
            />
          ) : (
            <div style={S.setupDestinoRow}>
              <div>
                <div style={S.setupCurrentLabel}>Onde esse dinheiro está sendo guardado</div>
                {challenge.destino?.banco || challenge.destino?.chave ? (
                  <div style={S.setupDestinoText}>
                    {challenge.destino?.banco && <strong>{challenge.destino.banco}</strong>}
                    {challenge.destino?.chave && <span> · Pix: {challenge.destino.chave}</span>}
                    {challenge.destino?.obs && <div style={S.setupDestinoObs}>{challenge.destino.obs}</div>}
                  </div>
                ) : (
                  <div style={S.setupDestinoText}>Nenhum destino informado ainda.</div>
                )}
              </div>
              <button style={S.secondaryBtn} onClick={() => setEditingDestino(true)}>
                {challenge.destino?.banco || challenge.destino?.chave ? "Editar" : "Informar"}
              </button>
            </div>
          )}
        </div>
      )}

      <div style={S.setupCard}>
        <h2 style={S.setupTitle}>
          {challenge ? "Começar um novo desafio" : "Escolha o valor do seu desafio"}
        </h2>
        <p style={S.setupText}>
          Informe quanto você quer guardar. O cofre divide essa meta em aportes crescentes —
          R$ 1, R$ 2, R$ 3 e assim por diante — e calcula exatamente quantos números você vai
          precisar preencher para fechar o valor certinho.
        </p>

        <div style={S.presetRow}>
          {PRESETS.map((p) => (
            <button key={p} style={S.presetChip} onClick={() => setInput(String(p))}>
              {fmtBRL(p)}
            </button>
          ))}
        </div>

        <label style={S.fieldLabel}>Ou digite outro valor</label>
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

        <label style={{ ...S.fieldLabel, marginTop: 22 }}>
          Onde esse dinheiro vai ser guardado? <span style={S.fieldOptional}>(opcional)</span>
        </label>
        <input
          value={banco}
          onChange={(e) => setBanco(e.target.value)}
          placeholder="ex: Banco Bradesco — Poupança"
          style={S.textInput}
        />
        <input
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          placeholder="ex: Chave Pix: 00.000.000/0001-00"
          style={{ ...S.textInput, marginTop: 8 }}
        />
        <input
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Observação (opcional)"
          style={{ ...S.textInput, marginTop: 8 }}
        />

        <button
          style={{ ...S.primaryBtn, ...S.setupSubmit, ...(preview ? {} : S.btnDisabled) }}
          disabled={!preview}
          onClick={() => handleCreateClick(input)}
        >
          Criar desafio
        </button>
      </div>

      {pendingGoal != null && (
        <ConfirmModal
          title="Começar um novo desafio?"
          message="Você já tem progresso no desafio atual. Criar um novo vai apagar todos os aportes registrados até agora."
          confirmLabel="Criar novo desafio"
          onConfirm={() => {
            onCreate(pendingGoal.value, pendingGoal.destino);
            setPendingGoal(null);
          }}
          onCancel={() => setPendingGoal(null)}
        />
      )}
    </div>
  );
}

function DestinoFields({ banco, chave, obs, onSave, onCancel }) {
  const [b, setB] = useState(banco || "");
  const [c, setC] = useState(chave || "");
  const [o, setO] = useState(obs || "");
  return (
    <div style={S.setupDestinoEdit}>
      <input
        value={b}
        onChange={(e) => setB(e.target.value)}
        placeholder="ex: Banco Bradesco — Poupança"
        style={S.textInput}
        autoFocus
      />
      <input
        value={c}
        onChange={(e) => setC(e.target.value)}
        placeholder="ex: Chave Pix: 00.000.000/0001-00"
        style={{ ...S.textInput, marginTop: 8 }}
      />
      <input
        value={o}
        onChange={(e) => setO(e.target.value)}
        placeholder="Observação (opcional)"
        style={{ ...S.textInput, marginTop: 8 }}
      />
      <div style={{ ...S.modalActions, marginTop: 12 }}>
        <div style={{ flex: 1 }} />
        <button style={S.modalCancel} onClick={onCancel}>
          Cancelar
        </button>
        <button style={S.modalSave} onClick={() => onSave({ banco: b, chave: c, obs: o })}>
          Salvar
        </button>
      </div>
    </div>
  );
}

function DestinoBadge({ destino, onEdit }) {
  const hasInfo = destino && (destino.banco || destino.chave);
  const [copied, setCopied] = useState(false);

  function copyPix() {
    if (!destino?.chave) return;
    navigator.clipboard
      .writeText(destino.chave)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  }

  return (
    <div className="no-print" style={S.destinoBadge}>
      <div style={S.destinoBadgeText}>
        <span style={S.destinoBadgeIcon}>🏦</span>
        {hasInfo ? (
          <span>
            Guardando em <strong>{destino.banco || "—"}</strong>
            {destino.chave && (
              <>
                {" "}
                · Pix: <strong>{destino.chave}</strong>
              </>
            )}
          </span>
        ) : (
          <span>Você ainda não informou onde esse dinheiro vai ser guardado.</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {destino?.chave && (
          <button style={S.destinoBadgeEdit} onClick={copyPix}>
            {copied ? "Copiado!" : "Copiar Pix"}
          </button>
        )}
        <button style={S.destinoBadgeEdit} onClick={onEdit}>
          {hasInfo ? "Editar" : "Informar"}
        </button>
      </div>
    </div>
  );
}

function DestinoModal({ destino, onSave, onClose }) {
  const [banco, setBanco] = useState(destino?.banco || "");
  const [chave, setChave] = useState(destino?.chave || "");
  const [obs, setObs] = useState(destino?.obs || "");
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalEyebrow}>DESTINO DO DINHEIRO</div>
        <h3 style={S.modalTitle}>Onde você está guardando?</h3>

        <label style={S.fieldLabel}>Banco / forma de guarda</label>
        <input
          value={banco}
          onChange={(e) => setBanco(e.target.value)}
          placeholder="ex: Banco Bradesco — Poupança"
          style={S.textInput}
          autoFocus
        />

        <label style={S.fieldLabel}>Chave Pix (ou dados de depósito)</label>
        <input
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          placeholder="ex: 00.000.000/0001-00"
          style={S.textInput}
        />

        <label style={S.fieldLabel}>Observação</label>
        <input
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="opcional"
          style={S.textInput}
        />

        <div style={S.modalActions}>
          <div style={{ flex: 1 }} />
          <button style={S.modalCancel} onClick={onClose}>
            Cancelar
          </button>
          <button style={S.modalSave} onClick={() => onSave({ banco, chave, obs })}>
            Salvar
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
    <div style={S.summaryWrap}>
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
    <div style={S.statCard}>
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
                <stop offset="0%" stopColor="#D4A843" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#D4A843" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#23302b" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" stroke="#8a988f" fontSize={11} tickLine={false} axisLine={{ stroke: "#23302b" }} minTickGap={24} />
            <YAxis
              stroke="#8a988f"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              width={36}
            />
            <Tooltip
              contentStyle={{ background: "#141a18", border: "1px solid #2c3a33", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#D4A843" }}
              formatter={(v) => [fmtBRL(v), "Acumulado"]}
            />
            <Area type="monotone" dataKey="total" stroke="#D4A843" strokeWidth={2} fill="url(#fillTotal)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <h3 style={{ ...S.panelTitle, marginTop: 32 }}>Aportes por mês</h3>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={monthlyData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#23302b" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mes" stroke="#8a988f" fontSize={11} tickLine={false} axisLine={{ stroke: "#23302b" }} />
            <YAxis stroke="#8a988f" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={36} />
            <Tooltip
              contentStyle={{ background: "#141a18", border: "1px solid #2c3a33", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#2E7D5B" }}
              formatter={(v) => [fmtBRL(v), "Guardado no mês"]}
            />
            <Bar dataKey="valor" fill="#2E7D5B" radius={[4, 4, 0, 0]} />
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

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
      ::selection { background: #D4A843; color: #0B0F0E; }
      @media print {
        .no-print { display: none !important; }
        body { background: #fff !important; }
      }
    `}</style>
  );
}

// ----------------------------- estilos -----------------------------

const FONT_DISPLAY = "'Fraunces', serif";
const FONT_BODY = "'Inter', sans-serif";
const FONT_MONO = "'IBM Plex Mono', monospace";

const COL = {
  bg: "#0B0F0E",
  panel: "#121815",
  panel2: "#161D19",
  border: "#243029",
  text: "#EDEAE0",
  textDim: "#9AA89E",
  gold: "#D4A843",
  green: "#2E7D5B",
  greenDim: "#1E4F3A",
  danger: "#C0654C",
};

const S = {
  app: {
    minHeight: "100vh",
    background: `radial-gradient(circle at 15% 0%, #15201a 0%, ${COL.bg} 55%)`,
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
    color: "#EAF6EE",
    padding: "10px 16px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  },
  header: { maxWidth: 980, margin: "0 auto 28px" },
  headerTop: { marginBottom: 10, minHeight: 28 },
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
  title: {
    fontFamily: FONT_DISPLAY,
    fontWeight: 600,
    fontSize: "clamp(32px, 5vw, 48px)",
    margin: "0 0 8px",
    lineHeight: 1.05,
  },
  subtitle: { color: COL.textDim, fontSize: 15, maxWidth: 560, lineHeight: 1.5, margin: 0 },

  // ---- setup screen ----
  setupWrap: { maxWidth: 640, margin: "0 auto" },
  setupCurrent: {
    background: COL.panel,
    border: `1px solid ${COL.border}`,
    borderRadius: 16,
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
    borderRadius: 16,
    padding: 28,
  },
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
    borderRadius: 12,
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
    borderRadius: 16,
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
    borderRadius: 10,
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
    borderRadius: 10,
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
    borderRadius: 8,
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
    background: `linear-gradient(160deg, ${COL.greenDim}, #15281f)`,
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
    borderRadius: 16,
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
    color: "#1a1304",
    border: "none",
    borderRadius: 8,
    padding: "9px 16px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  secondaryBtn: {
    background: "transparent",
    border: `1px solid ${COL.border}`,
    color: COL.text,
    borderRadius: 8,
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
  tableWrap: { overflowX: "auto", border: `1px solid ${COL.border}`, borderRadius: 10 },
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
    background: "rgba(5,8,7,0.65)",
    backdropFilter: "blur(2px)",
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
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
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
    borderRadius: 10,
    padding: "10px 12px",
    color: COL.text,
    fontSize: 14,
    fontFamily: FONT_BODY,
    outline: "none",
  },

  // ---- destino do dinheiro (banco / pix) ----
  destinoBadge: {
    maxWidth: 980,
    margin: "0 auto 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    background: COL.panel2,
    border: `1px dashed ${COL.gold}`,
    borderRadius: 12,
    padding: "10px 16px",
  },
  destinoBadgeText: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: COL.text,
    flexWrap: "wrap",
  },
  destinoBadgeIcon: { fontSize: 16 },
  destinoBadgeEdit: {
    background: "transparent",
    border: `1px solid ${COL.border}`,
    color: COL.gold,
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontFamily: FONT_MONO,
    cursor: "pointer",
  },
  setupDestinoDivider: {
    height: 1,
    background: COL.border,
    margin: "16px 0",
  },
  setupDestinoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  setupDestinoText: { fontSize: 13.5, color: COL.text, marginTop: 2 },
  setupDestinoObs: { fontSize: 12.5, color: COL.textDim, marginTop: 4 },
  setupDestinoEdit: { marginTop: 4 },

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
    borderRadius: 10,
    fontSize: 13.5,
    border: `1px solid ${COL.border}`,
    background: COL.panel2,
  },
  insightCardSuccess: {
    borderColor: COL.gold,
    background: "linear-gradient(90deg, rgba(212,168,67,0.12), transparent)",
  },
  insightCardWarning: {
    borderColor: COL.danger,
    background: "linear-gradient(90deg, rgba(192,101,76,0.14), transparent)",
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
    background: COL.panel2,
    border: `1px solid ${COL.border}`,
    borderRadius: 14,
    padding: "18px 16px 16px",
    opacity: 0.6,
  },
  achievementCardDone: {
    opacity: 1,
    borderColor: COL.gold,
    boxShadow: `0 0 0 1px ${COL.gold} inset, 0 8px 24px rgba(212,168,67,0.12)`,
    background: "linear-gradient(160deg, rgba(212,168,67,0.10), transparent)",
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
    color: "#1a1304",
    background: COL.gold,
    borderRadius: 999,
    padding: "3px 10px",
  },

  currencyInputWrap: {
    display: "flex",
    alignItems: "center",
    background: COL.panel2,
    border: `1px solid ${COL.border}`,
    borderRadius: 10,
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
    borderRadius: 10,
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
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    cursor: "pointer",
  },
  modalSave: {
    background: COL.gold,
    color: "#1a1304",
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  modalRemove: {
    background: "transparent",
    border: `1px solid ${COL.danger}`,
    color: COL.danger,
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    cursor: "pointer",
  },
};
