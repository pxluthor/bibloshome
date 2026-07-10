import React from 'react';

// Rótulos amigáveis para os "kind" conhecidos da API do Claude
const KIND_LABELS = {
    session: 'Sessão (5 h)',
    weekly_all: 'Semanal — todos os modelos',
    weekly_scoped: 'Semanal — por modelo',
    five_hour: 'Janela de 5 horas',
    seven_day: 'Janela de 7 dias',
};

function prettyKey(key) {
    return String(key)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatReset(iso) {
    if (!iso) return null;
    const target = new Date(iso).getTime();
    if (Number.isNaN(target)) return null;
    const diff = target - Date.now();
    if (diff <= 0) return 'renovando…';
    const totalMin = Math.floor(diff / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `reseta em ${days}d ${hours}h`;
    if (hours > 0) return `reseta em ${hours}h ${mins}min`;
    return `reseta em ${mins}min`;
}

function tone(pct, severity) {
    if (severity === 'critical' || pct >= 90) return { bar: 'bg-red-500', text: 'text-red-600' };
    if (severity === 'warning' || pct >= 70) return { bar: 'bg-yellow-500', text: 'text-yellow-600' };
    return { bar: 'bg-green-500', text: 'text-green-600' };
}

function labelForLimit(l) {
    if (l.kind === 'weekly_scoped' && l.scope?.model?.display_name) {
        return `Semanal — ${l.scope.model.display_name}`;
    }
    return KIND_LABELS[l.kind] || prettyKey(l.kind);
}

// Extrai medidores (label, percent, severity, resetsAt) das formas conhecidas.
function extractMeters(data) {
    const meters = [];

    // ── Forma Claude: array `limits` ──────────────────────────────────────
    if (Array.isArray(data.limits) && data.limits.length) {
        for (const l of data.limits) {
            if (l && typeof l.percent === 'number') {
                meters.push({
                    label: labelForLimit(l),
                    percent: l.percent,
                    severity: l.severity,
                    resetsAt: l.resets_at,
                });
            }
        }
        if (meters.length) return meters;
    }

    // ── Genérico (cobre Codex e afins): objetos com utilization/percent ───
    for (const [key, val] of Object.entries(data)) {
        if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
        const raw = typeof val.utilization === 'number'
            ? val.utilization
            : typeof val.percent === 'number'
                ? val.percent
                : null;
        if (raw === null) continue;
        // utilization pode vir em fração (0–1) ou porcentagem (0–100)
        const percent = raw <= 1 ? raw * 100 : raw;
        meters.push({
            label: prettyKey(key),
            percent,
            severity: val.severity,
            resetsAt: val.resets_at || val.resetsAt,
        });
    }
    return meters;
}

// Procura info de gasto em dólar/créditos
function extractSpend(data) {
    const s = data.spend;
    if (s && s.enabled && s.used) {
        const amount = (s.used.amount_minor ?? 0) / Math.pow(10, s.used.exponent ?? 2);
        return `Gasto: ${amount.toFixed(2)} ${s.used.currency || ''}`.trim();
    }
    return null;
}

export default function UsageChart({ data }) {
    if (!data) return null;

    const meters = extractMeters(data);
    const spend = extractSpend(data);

    // Fallback: forma desconhecida sem medidores → JSON formatado
    if (meters.length === 0) {
        return (
            <pre className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded-xl p-3 overflow-x-auto text-gray-600">
                {JSON.stringify(data, null, 2)}
            </pre>
        );
    }

    return (
        <div className="mt-3 space-y-3">
            {meters.map((m, i) => {
                const pct = Math.max(0, Math.min(100, Math.round(m.percent)));
                const t = tone(pct, m.severity);
                const reset = formatReset(m.resetsAt);
                return (
                    <div key={i}>
                        <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700">{m.label}</span>
                            <span className={`font-semibold tabular-nums ${t.text}`}>{pct}%</span>
                        </div>
                        <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full ${t.bar} rounded-full transition-all duration-500`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        {reset && <p className="mt-1 text-[11px] text-gray-400">{reset}</p>}
                    </div>
                );
            })}
            {spend && (
                <p className="pt-2 border-t border-gray-100 text-xs text-gray-500">{spend}</p>
            )}
        </div>
    );
}
