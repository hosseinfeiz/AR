import React from 'react'

export interface DigestItem {
  kind: 'maintenance_request' | 'showing_request' | 'system'
  ref_id?: string
  title: string
  summary: string
  created_at: string
  studio_url?: string
}

export interface BatchedDigestProps {
  recipient_email: string
  items: DigestItem[]
  generated_at: string
}

const wrapStyle: React.CSSProperties = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  maxWidth: 640,
  margin: '0 auto',
  padding: 24,
  color: '#111',
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
}

const headingStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  margin: 0,
  marginBottom: 4,
}

const metaStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  margin: 0,
  marginBottom: 8,
}

export function BatchedDigest(props: BatchedDigestProps) {
  return (
    <html>
      <body style={wrapStyle}>
        <h2>Your AR Management digest</h2>
        <p style={{ color: '#374151' }}>
          {props.items.length} new {props.items.length === 1 ? 'item' : 'items'} since the last digest.
        </p>
        {props.items.map((item, idx) => (
          <div key={`${item.kind}-${item.ref_id ?? idx}`} style={cardStyle}>
            <p style={headingStyle}>{item.title}</p>
            <p style={metaStyle}>
              {labelFor(item.kind)}
              {item.ref_id ? ` — #${item.ref_id}` : ''} · {item.created_at}
            </p>
            <p style={{ margin: 0, fontSize: 14 }}>{item.summary}</p>
            {item.studio_url && (
              <p style={{ margin: '8px 0 0', fontSize: 13 }}>
                <a href={item.studio_url}>Open in Supabase →</a>
              </p>
            )}
          </div>
        ))}
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 24 }}>
          Generated {props.generated_at}. Adjust your batching preferences in the admin
          notifications settings.
        </p>
      </body>
    </html>
  )
}

export function batchedDigestSubject(props: BatchedDigestProps): string {
  return `[AR Management] Digest — ${props.items.length} new ${props.items.length === 1 ? 'item' : 'items'}`
}

function labelFor(kind: DigestItem['kind']): string {
  switch (kind) {
    case 'maintenance_request': return 'Maintenance'
    case 'showing_request': return 'Showing'
    case 'system': return 'System'
  }
}
