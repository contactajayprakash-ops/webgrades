import { useHacData } from '../hooks/useHacData.js'
import { PageHead, Loading, ErrorBox } from '../components/ui.jsx'
import { Icon } from '../components/icons.jsx'

export default function Rank() {
  const { data, loading, error, refresh } = useHacData('rank', null)

  return (
    <>
      <PageHead title="Rank & GPA" sub="Official figures straight from your HAC transcript.">
        <button className="btn ghost sm" onClick={refresh}><Icon.refresh width={15} height={15} /> Refresh</button>
      </PageHead>

      {loading && <Loading />}
      {error && !loading && <ErrorBox message={error} onRetry={refresh} />}

      {!loading && !error && (
        <div className="grid grid-3">
          <div className="card stat">
            <span className="glow" style={{ background: 'var(--accent-2)' }} />
            <span className="label">Official GPA</span>
            <span className="value">{data?.gpa || '—'}</span>
            <span className="meta">cumulative, weighted</span>
          </div>
          <div className="card stat">
            <span className="label">Class Rank</span>
            <span className="value">{data?.rank ? `#${data.rank}` : '—'}</span>
            <span className="meta">your standing</span>
          </div>
          <div className="card stat">
            <span className="label">Class Size</span>
            <span className="value">{data?.outOf || '—'}</span>
            <span className="meta">students in your year</span>
          </div>
        </div>
      )}

      {!loading && !error && data?.rank && data?.outOf && (
        <div className="card card-pad mt-4">
          <div className="row-between mb-3">
            <h3>Percentile</h3>
            <span className="muted mono">
              Top {Math.max(1, Math.round((Number(data.rank) / Number(data.outOf)) * 100))}%
            </span>
          </div>
          <div style={{ height: 12, background: 'var(--bg)', borderRadius: 20, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{
              height: '100%',
              width: `${100 - (Number(data.rank) / Number(data.outOf)) * 100}%`,
              background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
            }} />
          </div>
          <div className="small faint mt-2">
            Ranked #{data.rank} of {data.outOf}. (Higher bar = closer to the top of the class.)
          </div>
        </div>
      )}
    </>
  )
}
