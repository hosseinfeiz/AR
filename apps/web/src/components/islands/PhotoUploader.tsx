import { useState } from 'react'

interface UploadResp {
  temp_id: string
  uploads: { path: string; signedUrl: string; token: string }[]
}

interface Props {
  supabaseUrl: string
  anonKey: string
  turnstileToken: string | null
  onPathsChange: (paths: string[]) => void
}

export function PhotoUploader({ supabaseUrl, anonKey, turnstileToken, onPathsChange }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [paths, setPaths] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).slice(0, 5)
    const oversize = picked.find((f) => f.size > 10 * 1024 * 1024)
    if (oversize) { setError(`${oversize.name} exceeds 10 MB limit`); return }
    setError(null)
    setFiles(picked)
  }

  async function handleUpload() {
    if (!turnstileToken) { setError('Please complete the captcha first'); return }
    if (files.length === 0) return
    setUploading(true); setError(null)
    try {
      const ct = files[0]!.type
      const r = await fetch(`${supabaseUrl}/functions/v1/request-upload-urls`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ count: files.length, content_type: ct, turnstile_token: turnstileToken }),
      })
      if (!r.ok) throw new Error(`server: ${await r.text()}`)
      const data = (await r.json()) as UploadResp
      for (let i = 0; i < files.length; i++) {
        const u = data.uploads[i]!
        const put = await fetch(u.signedUrl, { method: 'PUT', body: files[i]!, headers: { 'content-type': files[i]!.type, 'x-upsert': 'false' } })
        if (!put.ok) throw new Error(`upload ${i + 1} failed`)
      }
      const finalPaths = data.uploads.map((u) => u.path)
      setPaths(finalPaths); onPathsChange(finalPaths)
    } catch (e) { setError((e as Error).message) }
    finally { setUploading(false) }
  }

  return (
    <div>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handlePick} className="block text-sm" />
      <p className="text-xs text-gray-500 mt-1">Up to 5 photos, JPEG/PNG/WebP, 10 MB each.</p>
      {files.length > 0 && paths.length === 0 && (
        <button type="button" onClick={handleUpload} disabled={uploading || !turnstileToken}
                className="mt-2 px-3 py-1.5 bg-[var(--color-brand)] text-white rounded text-sm disabled:bg-gray-400">
          {uploading ? 'Uploading…' : `Upload ${files.length} photo${files.length === 1 ? '' : 's'}`}
        </button>
      )}
      {paths.length > 0 && <p className="text-sm text-green-700 mt-2">{paths.length} photo{paths.length === 1 ? '' : 's'} uploaded</p>}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
