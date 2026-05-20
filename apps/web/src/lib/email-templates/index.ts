// Render React Email-style components to static HTML strings.
//
// We use `react-dom/server`'s `renderToStaticMarkup` instead of
// `@react-email/render` so we don't have to add a runtime dep. The output is a
// plain HTML string suitable for `sendEmail({ html })`.

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ManagerNotification, managerNotificationSubject, type ManagerNotificationProps } from './ManagerNotification'
import { SubmitterConfirmation, submitterConfirmationSubject, type SubmitterConfirmationProps } from './SubmitterConfirmation'
import { BatchedDigest, batchedDigestSubject, type BatchedDigestProps, type DigestItem } from './BatchedDigest'

export {
  ManagerNotification,
  SubmitterConfirmation,
  BatchedDigest,
  type ManagerNotificationProps,
  type SubmitterConfirmationProps,
  type BatchedDigestProps,
  type DigestItem,
}

export interface RenderedEmail {
  subject: string
  html: string
}

function withDoctype(markup: string): string {
  return `<!doctype html>${markup}`
}

export function renderManagerNotification(props: ManagerNotificationProps): RenderedEmail {
  const html = withDoctype(renderToStaticMarkup(React.createElement(ManagerNotification, props)))
  return { subject: managerNotificationSubject(props), html }
}

export function renderSubmitterConfirmation(props: SubmitterConfirmationProps): RenderedEmail {
  const html = withDoctype(renderToStaticMarkup(React.createElement(SubmitterConfirmation, props)))
  return { subject: submitterConfirmationSubject(props), html }
}

export function renderBatchedDigest(props: BatchedDigestProps): RenderedEmail {
  const html = withDoctype(renderToStaticMarkup(React.createElement(BatchedDigest, props)))
  return { subject: batchedDigestSubject(props), html }
}
