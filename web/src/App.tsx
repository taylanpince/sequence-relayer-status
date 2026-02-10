import { useEffect, useMemo, useState } from 'react'

type Network = {
  chainId: number
  type: 'mainnet' | 'testnet'
  name: string
  title: string
  nativeCurrency: { symbol: string; name: string; decimals: number }
  logoUrl?: string
  blockExplorer?: { name: string; url: string }
}

type RelayerSender = {
  index: number
  address: string
  etherBalance: number
  usdValue: number | null
  enabled?: boolean
  active?: boolean
}

type RelayerStatus = {
  chainID?: number
  senders?: RelayerSender[]
  healthOK?: boolean
  uptime?: number
  commitHash?: string
}

type NativeToken = {
  symbol?: string
  name?: string
  coinGeckoId?: string
  usdPrice: number | null
}

type Summary = {
  senderCount: number
  zeroCount: number
  totalNative: number
  totalUsd: number | null
  minNative: number | null
  minUsd: number | null
  lowEth?: boolean
}

type ApiResult = {
  network: Network
  url: string
  ok: boolean
  status: number
  error?: string
  nativeToken?: NativeToken
  summary?: Summary
  data?: RelayerStatus
}

type ApiResponse = {
  generatedAt: string
  count: number
  results: ApiResult[]
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(n)
}

function fmtUsd(n: number | null) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}

export default function App() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'zero' | 'lowEth'>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/status')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ApiResponse
      setData(json)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    let results = data?.results ?? []

    const q = query.trim().toLowerCase()
    if (q) {
      results = results.filter(r => {
        const hay = `${r.network.name} ${r.network.title} ${r.network.chainId}`.toLowerCase()
        return hay.includes(q)
      })
    }

    if (filter === 'zero') {
      results = results.filter(r => (r.summary?.zeroCount ?? 0) > 0)
    }

    if (filter === 'lowEth') {
      results = results.filter(r => !!r.summary?.lowEth)
    }

    return results
  }, [data, query, filter])

  const summary = useMemo(() => {
    const results = data?.results ?? []

    let chainsUp = 0
    let chainsDown = 0
    let zeroSenders = 0
    let totalUsd = 0
    let hasUsd = false
    let lowEthChains = 0

    for (const r of results) {
      if (!r.ok) {
        chainsDown += 1
        continue
      }
      chainsUp += 1
      zeroSenders += r.summary?.zeroCount ?? 0
      if (r.summary?.lowEth) lowEthChains += 1

      if (typeof r.summary?.totalUsd === 'number' && r.network.type !== 'testnet') {
        totalUsd += r.summary.totalUsd
        hasUsd = true
      }
    }

    return {
      chainsUp,
      chainsDown,
      zeroSenders,
      lowEthChains,
      total: results.length,
      totalUsd: hasUsd ? totalUsd : null
    }
  }, [data])

  return (
    <div className="min-h-screen text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-yellow-400/15 ring-1 ring-yellow-300/20 flex items-center justify-center">
                <span className="text-yellow-300 font-black">S</span>
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Sequence Relayer Status</h1>
                <p className="text-slate-300">Sender balances across all Sequence-supported networks</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:items-end gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => void load()}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold ring-1 ring-white/10 hover:bg-slate-700"
                disabled={loading}
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
              <a
                href="/api/status"
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold ring-1 ring-white/10 hover:bg-slate-700"
                target="_blank"
                rel="noreferrer"
              >
                JSON
              </a>
            </div>
            <div className="text-xs text-slate-400">
              {data ? `Updated ${new Date(data.generatedAt).toLocaleString()}` : '—'}
            </div>
          </div>
        </header>

        <section className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label="All networks" value={summary.total} />
          <FilterPill
            active={filter === 'zero'}
            onClick={() => setFilter(filter === 'zero' ? 'all' : 'zero')}
            label="Zero-balance senders"
            value={summary.zeroSenders}
            tone={summary.zeroSenders ? 'bad' : 'good'}
          />
          <FilterPill
            active={filter === 'lowEth'}
            onClick={() => setFilter(filter === 'lowEth' ? 'all' : 'lowEth')}
            label="Low ETH chains (<$50 min)"
            value={summary.lowEthChains}
            tone={summary.lowEthChains ? 'bad' : 'good'}
          />
          <Stat label="Down" value={summary.chainsDown} tone={summary.chainsDown ? 'bad' : 'neutral'} />
        </section>

        <section className="mt-3">
          <div className="text-sm text-slate-400">
            Total sender funds (USD): <span className="text-slate-200 font-semibold">{fmtUsd(summary.totalUsd)}</span>
          </div>
        </section>

        <section className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full md:max-w-md">
            <input
              className="w-full rounded-xl bg-slate-900/40 px-4 py-3 text-sm ring-1 ring-white/10 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-300/40"
              placeholder="Filter networks (e.g. polygon, sepolia, 137…)"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="text-sm text-slate-400">
            {filter !== 'all' ? (
              <button
                className="underline decoration-white/20 hover:decoration-white/50"
                onClick={() => setFilter('all')}
              >
                Reset filter
              </button>
            ) : null}
          </div>
        </section>

        {error ? (
          <div className="mt-6 rounded-xl bg-red-500/10 ring-1 ring-red-500/20 p-4 text-sm text-red-200">{error}</div>
        ) : null}

        <section className="mt-8 grid grid-cols-1 gap-4">
          {filtered.map(r => (
            <NetworkCard
              key={r.network.name}
              r={r}
              showOnlyZero={filter === 'zero'}
              expanded={!!expanded[r.network.name]}
              onToggle={() =>
                setExpanded(prev => ({
                  ...prev,
                  [r.network.name]: !prev[r.network.name]
                }))
              }
            />
          ))}
        </section>

        <footer className="mt-12 text-xs text-slate-500">
          Built for Taylan · powered by <code>@0xsequence/wallet-primitives</code>
        </footer>
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'good' | 'bad' }) {
  const toneClasses =
    tone === 'good'
      ? 'bg-emerald-500/10 ring-1 ring-emerald-500/20'
      : tone === 'bad'
        ? 'bg-red-500/10 ring-1 ring-red-500/20'
        : 'bg-slate-800/40 ring-1 ring-white/10'

  return (
    <div className={`rounded-2xl p-4 ${toneClasses}`}>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  )
}

function FilterPill({
  label,
  value,
  active,
  onClick,
  tone = 'neutral'
}: {
  label: string
  value: number
  active: boolean
  onClick: () => void
  tone?: 'neutral' | 'good' | 'bad'
}) {
  const toneClasses =
    tone === 'good'
      ? 'bg-emerald-500/10 ring-1 ring-emerald-500/20'
      : tone === 'bad'
        ? 'bg-red-500/10 ring-1 ring-red-500/20'
        : 'bg-slate-800/40 ring-1 ring-white/10'

  return (
    <button
      onClick={onClick}
      className={`rounded-2xl p-4 text-left transition ${toneClasses} ${active ? 'ring-2 ring-yellow-300/40' : ''}`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {active ? <div className="mt-1 text-xs text-slate-400">Active</div> : <div className="mt-1 text-xs text-slate-500">Click to filter</div>}
    </button>
  )
}

function NetworkCard({
  r,
  showOnlyZero,
  expanded,
  onToggle
}: {
  r: ApiResult
  showOnlyZero: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const n = r.network
  const symbol = r.nativeToken?.symbol ?? n.nativeCurrency?.symbol ?? 'NATIVE'
  const usdPrice = r.nativeToken?.usdPrice ?? null

  const sendersAll = r.data?.senders ?? []
  const senders = showOnlyZero ? sendersAll.filter(s => (s.etherBalance ?? 0) <= 0) : sendersAll
  const zeros = r.summary?.zeroCount ?? sendersAll.filter(s => (s.etherBalance ?? 0) <= 0).length

  const senderCount = r.summary?.senderCount ?? sendersAll.length
  const totalUsd = r.summary?.totalUsd ?? null
  const minNative = r.summary?.minNative ?? null
  const minUsd = r.summary?.minUsd ?? null

  return (
    <div className="rounded-2xl bg-slate-900/30 ring-1 ring-white/10 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-left hover:bg-white/[0.03] transition"
      >
        <div className="flex items-center gap-3">
          {n.logoUrl ? (
            <img src={n.logoUrl} alt={n.title} className="h-10 w-10 rounded-xl bg-white/5 ring-1 ring-white/10" />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-white/5 ring-1 ring-white/10" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{n.title}</h2>
              <span className="text-xs rounded-full px-2 py-0.5 ring-1 ring-white/10 bg-white/5 text-slate-300">{n.type}</span>
              <span className="text-xs rounded-full px-2 py-0.5 ring-1 ring-white/10 bg-white/5 text-slate-300">chainId {n.chainId}</span>
            </div>
            <div className="text-sm text-slate-400">
              <code className="text-slate-300">{n.name}</code> · native: <span className="text-slate-200">{symbol}</span>
              {n.type === 'testnet' ? (
                <span className="text-slate-500"> · testnet (no USD value)</span>
              ) : typeof usdPrice === 'number' ? (
                <span className="text-slate-500"> · {fmtUsd(usdPrice)} / {symbol}</span>
              ) : (
                <span className="text-slate-500"> · USD price unavailable</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/10 hover:bg-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            /status
          </a>

          {r.ok ? (
            <>
              <span className="rounded-lg bg-white/5 ring-1 ring-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300">
                {senderCount} sender(s)
              </span>
              <span className="rounded-lg bg-white/5 ring-1 ring-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300">
                min: {typeof minNative === 'number' ? `${fmt(minNative)} ${symbol}` : '—'}
                {n.type === 'testnet' ? '' : ` (${fmtUsd(minUsd)})`}
              </span>
              <span className="rounded-lg bg-white/5 ring-1 ring-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300">
                total: {n.type === 'testnet' ? '—' : fmtUsd(totalUsd)}
              </span>
              <span
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ${zeros ? 'bg-red-500/10 ring-red-500/20 text-red-200' : 'bg-emerald-500/10 ring-emerald-500/20 text-emerald-200'}`}
              >
                {zeros ? `${zeros} at 0` : 'All > 0'}
              </span>
            </>
          ) : (
            <span className="rounded-lg bg-red-500/10 ring-1 ring-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-200">
              Down ({r.error ?? `HTTP ${r.status}`})
            </span>
          )}

          <span className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/10 text-slate-300">
            {expanded ? 'Hide' : 'Show'} senders
          </span>
        </div>
      </button>

      {expanded && r.ok ? (
        <div className="border-t border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">Address</th>
                  <th className="px-5 py-3">Balance ({symbol})</th>
                  <th className="px-5 py-3">USD</th>
                  <th className="px-5 py-3">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {senders.map(s => {
                  const ok = (s.etherBalance ?? 0) > 0
                  return (
                    <tr key={s.address} className={ok ? '' : 'bg-red-500/5'}>
                      <td className="px-5 py-3 text-slate-400">{s.index}</td>
                      <td className="px-5 py-3 font-mono text-xs md:text-sm text-slate-200">{s.address}</td>
                      <td className={`px-5 py-3 font-semibold ${ok ? 'text-slate-100' : 'text-red-200'}`}>{fmt(s.etherBalance ?? 0)}</td>
                      <td className="px-5 py-3 font-semibold text-slate-200">{n.type === 'testnet' ? '—' : fmtUsd(s.usdValue)}</td>
                      <td className="px-5 py-3 text-slate-400">
                        <span className="inline-flex gap-2">
                          {s.enabled === false ? <Badge tone="bad">disabled</Badge> : <Badge>enabled</Badge>}
                          {s.active === false ? <Badge tone="bad">inactive</Badge> : <Badge>active</Badge>}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Badge({ children, tone = 'neutral' }: { children: any; tone?: 'neutral' | 'bad' }) {
  const cls =
    tone === 'bad'
      ? 'bg-red-500/10 ring-red-500/20 text-red-200'
      : 'bg-white/5 ring-white/10 text-slate-300'

  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}>{children}</span>
}
