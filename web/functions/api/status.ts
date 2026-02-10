import { Network } from '@0xsequence/wallet-primitives'

const COINGECKO_ID_BY_SYMBOL: Record<string, string | undefined> = {
  ETH: 'ethereum',
  sETH: 'ethereum',
  OP: 'optimism',
  POL: 'polygon-ecosystem-token',
  MATIC: 'matic-network',
  BNB: 'binancecoin',
  AVAX: 'avalanche-2',
  XDAI: 'gnosis',
  GLMR: 'moonbeam',
  MOVR: 'moonriver',
  APE: 'apecoin',
  XAI: 'xai',
  IMX: 'immutable-x',
  XTZ: 'tezos',
  OAS: 'oasys',
  USDC: 'usd-coin'
}

async function fetchUsdPrices(ids: string[], apiKey?: string): Promise<Record<string, number>> {
  if (ids.length === 0) return {}

  const url = new URL('https://api.coingecko.com/api/v3/simple/price')
  url.searchParams.set('ids', ids.join(','))
  url.searchParams.set('vs_currencies', 'usd')

  const res = await fetch(url.toString(), {
    headers: {
      accept: 'application/json',
      ...(apiKey ? { 'x-cg-pro-api-key': apiKey } : {})
    },
    cf: {
      // Cache prices briefly at the edge.
      cacheTtl: 60,
      cacheEverything: true
    }
  })

  if (!res.ok) {
    throw new Error(`CoinGecko HTTP ${res.status}`)
  }

  const json = (await res.json()) as Record<string, { usd?: number }>
  const out: Record<string, number> = {}
  for (const [id, v] of Object.entries(json)) {
    if (typeof v?.usd === 'number') out[id] = v.usd
  }
  return out
}

export const onRequest: PagesFunction = async (ctx) => {
  const networks = Network.ALL
  const apiKey = (ctx.env as any)?.COINGECKO_API_KEY

  // Determine which CoinGecko ids we need for native tokens.
  const idsNeeded = new Set<string>()
  const coinGeckoIdByNetworkName: Record<string, string | undefined> = {}

  for (const n of networks) {
    const sym = n.nativeCurrency?.symbol
    const id = sym ? COINGECKO_ID_BY_SYMBOL[sym] : undefined
    coinGeckoIdByNetworkName[n.name] = id
    if (id) idsNeeded.add(id)
  }

  let pricesUsd: Record<string, number> = {}
  let pricingError: string | null = null
  try {
    pricesUsd = await fetchUsdPrices(Array.from(idsNeeded), apiKey)
  } catch (e: any) {
    // Non-fatal: we still return balances, but USD fields will be null.
    pricingError = e?.message ?? String(e)
    pricesUsd = {}
  }

  // Simple concurrency limiter for relayer /status fetches.
  const concurrency = 12
  const results: any[] = []
  let i = 0

  const worker = async () => {
    while (i < networks.length) {
      const idx = i++
      const n = networks[idx]
      const url = `https://${n.name}-relayer.sequence.app/status`

      const coinGeckoId = coinGeckoIdByNetworkName[n.name]
      const usdPrice = coinGeckoId ? pricesUsd[coinGeckoId] ?? null : null

      try {
        const res = await fetch(url, {
          headers: {
            accept: 'application/json'
          }
        })

        if (!res.ok) {
          results[idx] = {
            network: n,
            url,
            ok: false,
            status: res.status,
            error: `HTTP ${res.status}`,
            nativeToken: {
              symbol: n.nativeCurrency?.symbol,
              name: n.nativeCurrency?.name,
              coinGeckoId,
              usdPrice
            }
          }
          continue
        }

        const jsonRaw: any = await res.json()

        const senders = Array.isArray(jsonRaw?.senders) ? jsonRaw.senders : []
        const enrichedSenders = senders.map((s: any) => {
          const bal = typeof s?.etherBalance === 'number' ? s.etherBalance : 0
          return {
            ...s,
            usdValue: typeof usdPrice === 'number' ? bal * usdPrice : null
          }
        })

        const totalNative = enrichedSenders.reduce(
          (acc: number, s: any) => acc + (typeof s.etherBalance === 'number' ? s.etherBalance : 0),
          0
        )
        const totalUsd = typeof usdPrice === 'number' ? totalNative * usdPrice : null
        const minNative = enrichedSenders.length
          ? Math.min(...enrichedSenders.map((s: any) => (typeof s.etherBalance === 'number' ? s.etherBalance : 0)))
          : null
        const minUsd = typeof usdPrice === 'number' && typeof minNative === 'number' ? minNative * usdPrice : null
        const zeroCount = enrichedSenders.reduce((acc: number, s: any) => acc + ((s.etherBalance ?? 0) <= 0 ? 1 : 0), 0)

        const data = {
          ...(typeof jsonRaw === 'object' && jsonRaw ? jsonRaw : {}),
          senders: enrichedSenders
        }

        results[idx] = {
          network: n,
          url,
          ok: true,
          status: res.status,
          nativeToken: {
            symbol: n.nativeCurrency?.symbol,
            name: n.nativeCurrency?.name,
            coinGeckoId,
            usdPrice
          },
          data,
          summary: {
            senderCount: enrichedSenders.length,
            zeroCount,
            totalNative,
            totalUsd,
            minNative,
            minUsd
          }
        }
      } catch (e: any) {
        results[idx] = {
          network: n,
          url,
          ok: false,
          status: 0,
          error: e?.message ?? String(e),
          nativeToken: {
            symbol: n.nativeCurrency?.symbol,
            name: n.nativeCurrency?.name,
            coinGeckoId,
            usdPrice
          }
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  return new Response(
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      pricing: {
        apiKeyPresent: !!apiKey,
        idsRequested: Array.from(idsNeeded),
        idsPriced: Object.keys(pricesUsd),
        error: pricingError
      },
      count: results.length,
      results
    }),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'no-store'
      }
    }
  )
}
