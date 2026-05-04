export interface SendEmailArgs {
  to: string[]
  subject: string
  html: string
  reply_to?: string
}

export async function sendEmail(args: SendEmailArgs) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM_EMAIL'),
      to: args.to,
      subject: args.subject,
      html: args.html,
      reply_to: args.reply_to,
    }),
  })
  if (!r.ok) throw new Error(`resend ${r.status} ${await r.text()}`)
  return r.json() as Promise<{ id: string }>
}
