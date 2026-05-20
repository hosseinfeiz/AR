import React from 'react'

export interface SubmitterConfirmationProps {
  type: 'maintenance' | 'showing'
  ref_id: string
  recipient_name: string
}

const wrapStyle: React.CSSProperties = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  maxWidth: 600,
  margin: '0 auto',
  padding: 24,
  color: '#111',
}

export function SubmitterConfirmation(props: SubmitterConfirmationProps) {
  return (
    <html>
      <body style={wrapStyle}>
        <h2>Thanks, {props.recipient_name}!</h2>
        <p>
          We received your {props.type} request. Your reference is{' '}
          <code>{props.ref_id}</code>.
        </p>
        <p>A property manager will follow up within one business day.</p>
        <p>— AR Management</p>
      </body>
    </html>
  )
}

export function submitterConfirmationSubject(props: SubmitterConfirmationProps): string {
  return `We received your ${props.type} request — AR Management`
}
