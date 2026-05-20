// React Email-style template for manager notifications.
//
// We don't depend on `@react-email/components` at runtime — the package isn't
// installed and would not run in the Supabase edge function (Deno) anyway.
// Instead, we use plain React + `react-dom/server` to render to a static HTML
// string. The component structure mirrors React Email so we can swap in their
// primitives later if/when the dep is added.

import React from 'react'

export interface ManagerNotificationProps {
  type: 'maintenance' | 'showing'
  ref_id: string
  building_name: string
  details: Record<string, string>
  studio_url: string
  is_emergency?: boolean
}

const wrapStyle: React.CSSProperties = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  maxWidth: 600,
  margin: '0 auto',
  padding: 24,
  color: '#111',
}

const tableStyle: React.CSSProperties = {
  borderCollapse: 'collapse',
  border: '1px solid #ddd',
  width: '100%',
}

const cellLabel: React.CSSProperties = { padding: '4px 8px', fontWeight: 600 }
const cellValue: React.CSSProperties = { padding: '4px 8px' }

const buttonStyle: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  padding: '10px 16px',
  textDecoration: 'none',
  borderRadius: 6,
  display: 'inline-block',
}

export function ManagerNotification(props: ManagerNotificationProps) {
  return (
    <html>
      <body style={wrapStyle}>
        {props.is_emergency && (
          <p
            style={{
              background: '#fee2e2',
              border: '1px solid #fecaca',
              padding: '8px 12px',
              borderRadius: 6,
              color: '#991b1b',
              fontWeight: 600,
            }}
          >
            EMERGENCY — please respond immediately.
          </p>
        )}
        <h2>New {props.type} request</h2>
        <p>
          <strong>{props.building_name}</strong> — <code>{props.ref_id}</code>
        </p>
        <table style={tableStyle}>
          <tbody>
            {Object.entries(props.details).map(([k, v]) => (
              <tr key={k}>
                <td style={cellLabel}>{k}</td>
                <td style={cellValue}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 24 }}>
          <a href={props.studio_url} style={buttonStyle}>
            Open in Supabase
          </a>
        </p>
      </body>
    </html>
  )
}

export function managerNotificationSubject(props: ManagerNotificationProps): string {
  const prefix = props.is_emergency ? '[EMERGENCY] ' : ''
  return `${prefix}[AR Management] New ${props.type} request — ${props.building_name} #${props.ref_id}`
}
