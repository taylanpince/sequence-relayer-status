import { Network } from '@0xsequence/wallet-primitives'

export const onRequest: PagesFunction = async () => {
  const networks = Network.ALL

  // Simple concurrency limiter.
  const concurrency = 12
  const results: any[] = []
  let i = 0

  const worker = async () => {
    while (i < networks.length) {
      const idx = i++
      const n = networks[idx]
      const url = `https://${n.name}-relayer.sequence.app/status`

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
            error: `HTTP ${res.status}`
          }
          continue
        }

        const json = await res.json()

        results[idx] = {
          network: n,
          url,
          ok: true,
          status: res.status,
          data: json
        }
      } catch (e: any) {
        results[idx] = {
          network: n,
          url,
          ok: false,
          status: 0,
          error: e?.message ?? String(e)
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  // CORS: allow the dashboard (and future tooling) to call this endpoint.
  return new Response(JSON.stringify({
    generatedAt: new Date().toISOString(),
    count: results.length,
    results
  }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store'
    }
  })
}
