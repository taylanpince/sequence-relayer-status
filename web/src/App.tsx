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

type ApiResult = {
  network: Network
  url: string
  ok: boolean
  status: number
  error?: string
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

export default function App() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

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
    const results = data?.results ?? []
    const q = query.trim().toLowerCase()
    if (!q) return results
    return results.filter(r => {
      const hay = `${r.network.name} ${r.network.title} ${r.network.chainId}`.toLowerCase()
      return hay.includes(q)
    })
  }, [data, query])

  const summary = useMemo(() => {
    const results = filtered
    let chainsUp = 0
    let chainsDown = 0
    let zeroSenders = 0

    for (const r of results) {
      if (!r.ok) {
        chainsDown += 1
        continue
      }
      chainsUp += 1
      for (const s of r.data?.senders ?? []) {
        if ((s.etherBalance ?? 0) <= 0) zeroSenders += 1
      }
    }

    return { chainsUp, chainsDown, zeroSenders, total: results.length }
  }, [filtered])

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
          <Stat label="Networks" value={summary.total} />
          <Stat label="Up" value={summary.chainsUp} tone="good" />
          <Stat label="Down" value={summary.chainsDown} tone={summary.chainsDown ? 'bad' : 'neutral'} />
          <Stat label="Zero-balance senders" value={summary.zeroSenders} tone={summary.zeroSenders ? 'bad' : 'good'} />
        </section>

        <section className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full md:max-w-md">
            <input
              className="w-full rounded-xl bg-slate-900/40 px-4 py-3 text-sm ring-1 ring-white/10 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-300/40"
              placeholder="Filter (e.g. polygon, sepolia, 137…)"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="text-sm text-slate-400">
            Relayer host pattern: <code className="text-slate-200">{'{network}-relayer.sequence.app'}</code>
          </div>
        </section>

        {error ? (
          <div className="mt-6 rounded-xl bg-red-500/10 ring-1 ring-red-500/20 p-4 text-sm text-red-200">{error}</div>
        ) : null}

        <section className="mt-8 grid grid-cols-1 gap-4">
          {filtered.map(r => (
            <NetworkCard key={r.network.name} r={r} />
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

function NetworkCard({ r }: { r: ApiResult }) {
  const n = r.network
  const symbol = n.nativeCurrency?.symbol ?? 'NATIVE'

  const senders = r.data?.senders ?? []
  const zeros = senders.filter(s => (s.etherBalance ?? 0) <= 0).length

  return (
    <div className="rounded-2xl bg-slate-900/30 ring-1 ring-white/10 overflow-hidden">
      <div className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          {n.logoUrl ? (
            <img src={n.logoUrl} alt={n.title} className="h-10 w-10 rounded-xl bg-white/5 ring-1 ring-white/10" />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-white/5 ring-1 ring-white/10" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{n.title}</h2>
              <span className="text-xs rounded-full px-2 py-0.5 ring-1 ring-white/10 bg-white/5 text-slate-300">
                {n.type}
              </span>
              <span className="text-xs rounded-full px-2 py-0.5 ring-1 ring-white/10 bg-white/5 text-slate-300">
                chainId {n.chainId}
              </span>
            </div>
            <div className="text-sm text-slate-400">
              <code className="text-slate-300">{n.name}</code> · native: <span className="text-slate-200">{symbol}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/10 hover:bg-slate-700"
          >
            Open /status
          </a>
          {r.ok ? (
            <span className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ${zeros ? 'bg-red-500/10 ring-red-500/20 text-red-200' : 'bg-emerald-500/10 ring-emerald-500/20 text-emerald-200'}`}>
              {zeros ? `${zeros} sender(s) at 0` : 'All senders > 0'}
            </span>
          ) : (
            <span className="rounded-lg bg-red-500/10 ring-1 ring-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-200">
              Down ({r.error ?? `HTTP ${r.status}`})
            </span>
          )}
        </div>
      </div>

      {r.ok ? (
        <div className="border-t border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">Address</th>
                  <th className="px-5 py-3">Balance ({symbol})</th>
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
