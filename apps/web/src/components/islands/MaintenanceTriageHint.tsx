// Inline AI hint shown beneath the maintenance description textarea.
//
// Calls /api/maintenance-triage with a short debounce on description /
// issue_type / urgency changes. Renders a small banner with the
// classification, a conflict warning if the user's chosen urgency
// disagrees with the suggestion, and nothing at all when the input is too
// short or the API is disabled (graceful no-op).
//
// Note: this component is meant to be added to MaintenanceForm.tsx
// AFTER the description textarea. S10 does NOT modify MaintenanceForm
// directly (other agents own that file) — the integration is documented
// in the runbook.

import { useEffect, useRef, useState } from 'react'

export interface MaintenanceTriageHintProps {
  description: string
  issueType: 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'pest' | 'locks' | 'other' | null | undefined
  urgency: 'low' | 'normal' | 'high' | 'emergency' | null | undefined
  /** Debounce window in ms — defaults to 700. */
  debounceMs?: number
}

interface TriageResult {
  suggested_issue_type: MaintenanceTriageHintProps['issueType']
  suggested_urgency: MaintenanceTriageHintProps['urgency']
  rationale: string
  urgency_conflict: boolean | null
  issue_type_conflict: boolean | null
}

interface ApiResponse {
  ok: boolean
  result: TriageResult | null
  ai_enabled?: boolean
}

const URGENCY_LABEL: Record<string, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  emergency: 'Emergency',
}

const ISSUE_LABEL: Record<string, string> = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  appliance: 'Appliance',
  pest: 'Pest',
  locks: 'Locks',
  other: 'Other',
}

export function MaintenanceTriageHint({
  description,
  issueType,
  urgency,
  debounceMs = 700,
}: MaintenanceTriageHintProps) {
  const [result, setResult] = useState<TriageResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [aiEnabled, setAiEnabled] = useState<boolean>(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!description || description.trim().length < 10) {
      setResult(null)
      return
    }
    const handle = window.setTimeout(async () => {
      // Cancel any in-flight request so we don't race.
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      try {
        const res = await fetch('/api/maintenance-triage', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            description,
            issue_type: issueType ?? null,
            urgency: urgency ?? null,
          }),
          signal: controller.signal,
        })
        if (!res.ok) {
          setResult(null)
          return
        }
        const data = (await res.json()) as ApiResponse
        setAiEnabled(data.ai_enabled !== false)
        setResult(data.result ?? null)
      } catch (e) {
        if ((e as { name?: string }).name !== 'AbortError') {
          setResult(null)
        }
      } finally {
        setLoading(false)
      }
    }, debounceMs)
    return () => {
      window.clearTimeout(handle)
    }
  }, [description, issueType, urgency, debounceMs])

  if (!aiEnabled) return null
  if (!result && !loading) return null

  if (loading && !result) {
    return (
      <p className="text-xs text-gray-400 mt-1" aria-live="polite">
        Analyzing description…
      </p>
    )
  }
  if (!result) return null

  const conflict = result.urgency_conflict || result.issue_type_conflict
  const cls = conflict
    ? 'border border-amber-300 bg-amber-50 text-amber-900'
    : 'border border-blue-200 bg-blue-50 text-blue-900'

  return (
    <div className={`mt-2 rounded-lg p-3 text-sm ${cls}`} role="status" aria-live="polite">
      <p className="font-medium">
        {conflict ? 'Suggested adjustment' : 'AI suggestion'}
      </p>
      <p className="mt-1">
        Looks like <strong>{ISSUE_LABEL[result.suggested_issue_type ?? 'other']}</strong> ·
        urgency <strong>{URGENCY_LABEL[result.suggested_urgency ?? 'normal']}</strong>.
      </p>
      {result.rationale && <p className="mt-1 text-xs opacity-80">{result.rationale}</p>}
      {result.urgency_conflict && urgency && (
        <p className="mt-2 text-xs">
          You picked <strong>{URGENCY_LABEL[urgency]}</strong>. Consider whether{' '}
          <strong>{URGENCY_LABEL[result.suggested_urgency ?? 'normal']}</strong> is a better fit.
        </p>
      )}
      {result.issue_type_conflict && issueType && (
        <p className="mt-1 text-xs">
          You selected <strong>{ISSUE_LABEL[issueType]}</strong>. The description sounds more
          like <strong>{ISSUE_LABEL[result.suggested_issue_type ?? 'other']}</strong>.
        </p>
      )}
    </div>
  )
}

export default MaintenanceTriageHint
