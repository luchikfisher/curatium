import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { isFrontendError, type FrontendError } from '../api/errors'
import { LoadingState } from '../components/AsyncState'
import {
  ExhibitionMetadataForm,
} from '../features/exhibitions/ExhibitionMetadataForm'
import { deleteDraftExhibition, getExhibition, updateExhibition } from '../features/exhibitions/api'
import { applyMetadataRequestError } from '../features/exhibitions/formErrors'
import type { MetadataFieldErrors } from '../features/exhibitions/metadataValidation'
import { useExhibition } from '../features/exhibitions/useExhibition'
import type { ExhibitionMetadata } from '../features/exhibitions/types'

const emptyMetadata: ExhibitionMetadata = { title: '', summary: '', introduction: '' }

export function EditExhibitionPage() {
  const { id } = useParams()
  const exhibitionId = parseExhibitionId(id)
  if (exhibitionId === null) return <InvalidExhibitionRoute />
  return <ExhibitionEditor key={id} exhibitionId={exhibitionId} />
}

function ExhibitionEditor({ exhibitionId }: { exhibitionId: number }) {
  const navigate = useNavigate()
  const { data: exhibition, error: loadError, retry } = useExhibition(exhibitionId, getExhibition)
  const [metadata, setMetadata] = useState(emptyMetadata)
  const [loadedId, setLoadedId] = useState<number | null>(null)
  const [fieldErrors, setFieldErrors] = useState<MetadataFieldErrors>({})
  const [error, setError] = useState<FrontendError | Error | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [readOnly, setReadOnly] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const requestController = useRef<AbortController | null>(null)
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const confirmDeleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const restoreDeleteFocus = useRef(false)

  useEffect(() => () => requestController.current?.abort(), [])
  useEffect(() => {
    if (confirmingDelete) {
      confirmDeleteButtonRef.current?.focus()
    } else if (restoreDeleteFocus.current) {
      deleteButtonRef.current?.focus()
      restoreDeleteFocus.current = false
    }
  }, [confirmingDelete])

  if (!exhibition || exhibition.id !== exhibitionId) {
    if (!loadError) return <LoadingState label="Loading exhibition metadata…" />
    if (isFrontendError(loadError) && loadError.status === 404) {
      return <ExhibitionNotFound onRetry={retry} />
    }
    return <ExhibitionLoadError error={loadError} onRetry={retry} />
  }

  const currentExhibition = exhibition
  const currentExhibitionId = exhibitionId
  const formMetadata = loadedId === currentExhibition.id
    ? metadata
    : {
        title: currentExhibition.title,
        summary: currentExhibition.summary ?? '',
        introduction: currentExhibition.introduction ?? '',
      }
  const isReadOnly = readOnly || currentExhibition.status === 'PUBLISHED'
  const busy = updating || deleting

  function change(field: keyof ExhibitionMetadata, value: string) {
    setLoadedId(currentExhibition.id)
    setMetadata({ ...formMetadata, [field]: value })
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setError(null)
    setSuccessMessage('')
  }

  function handleReadOnlyError(reason: unknown): boolean {
    if (isFrontendError(reason) && reason.code === 'PUBLISHED_EXHIBITION_READ_ONLY') {
      setReadOnly(true)
      setConfirmingDelete(false)
      setError(reason)
      return true
    }
    return false
  }

  async function save() {
    if (busy || isReadOnly) return
    const controller = new AbortController()
    requestController.current = controller
    setUpdating(true)
    setError(null)
    setFieldErrors({})
    setSuccessMessage('')
    try {
      const updated = await updateExhibition(currentExhibitionId, formMetadata, controller.signal)
      if (!controller.signal.aborted) {
        setMetadata({
          title: updated.title,
          summary: updated.summary ?? '',
          introduction: updated.introduction ?? '',
        })
        setLoadedId(updated.id)
        setReadOnly(updated.status === 'PUBLISHED')
        setSuccessMessage('Metadata saved.')
      }
    } catch (reason) {
      if (!controller.signal.aborted && !handleReadOnlyError(reason)) {
        applyMetadataRequestError(reason, setFieldErrors, setError)
      }
    } finally {
      if (!controller.signal.aborted) setUpdating(false)
    }
  }

  async function deleteExhibition() {
    if (busy || isReadOnly) return
    const controller = new AbortController()
    requestController.current = controller
    setDeleting(true)
    setError(null)
    try {
      await deleteDraftExhibition(currentExhibitionId, controller.signal)
      if (!controller.signal.aborted) navigate('/exhibitions', { replace: true })
    } catch (reason) {
      if (!controller.signal.aborted && !handleReadOnlyError(reason)) {
        applyMetadataRequestError(reason, setFieldErrors, setError)
      }
    } finally {
      if (!controller.signal.aborted) setDeleting(false)
    }
  }

  function cancelDeletion() {
    restoreDeleteFocus.current = true
    setConfirmingDelete(false)
  }

  return (
    <section className="editor-page">
      <div className="page-heading editor-heading">
        <p className="eyebrow">Curator workspace</p>
        <h1>Edit exhibition</h1>
        <p className="lede">Refine the exhibition story before selecting its artworks.</p>
      </div>
      <nav className="editor-links" aria-label="Exhibition actions">
        <Link className="button button-secondary" to={`/exhibitions/${currentExhibition.id}/artworks`}>Curate artworks</Link>
        <Link className="button button-secondary" to={`/exhibitions/${currentExhibition.id}/preview`}>Preview exhibition</Link>
      </nav>
      <section className="editor-section" aria-labelledby="metadata-heading">
        <h2 id="metadata-heading">Exhibition metadata</h2>
        {isReadOnly && (
          <p className="form-alert" role="status">
            This exhibition is published and read-only. Unpublish it before changing metadata or deleting it.
          </p>
        )}
        <RequestError error={error} />
        {successMessage && <p className="form-success" role="status">{successMessage}</p>}
        <ExhibitionMetadataForm
          metadata={formMetadata}
          fieldErrors={fieldErrors}
          submitting={busy}
          readOnly={isReadOnly}
          submitLabel="Save metadata"
          onChange={change}
          onSubmit={save}
          onClientValidationFailure={setFieldErrors}
        />
      </section>
      {!isReadOnly && (
        <section className="editor-section delete-section" aria-labelledby="delete-heading">
          <h2 id="delete-heading">Delete draft</h2>
          <p>Deleting a draft permanently removes its metadata and curated artworks.</p>
          {!confirmingDelete ? (
            <button ref={deleteButtonRef} className="button button-danger" type="button" disabled={busy} onClick={() => setConfirmingDelete(true)}>
              Delete exhibition
            </button>
          ) : (
            <div className="delete-confirmation" role="alert">
              <p>Delete this draft exhibition? This cannot be undone.</p>
              <button ref={confirmDeleteButtonRef} className="button button-danger" type="button" disabled={busy} onClick={deleteExhibition}>
                {deleting ? 'Deleting…' : 'Confirm deletion'}
              </button>
              <button className="button button-secondary" type="button" disabled={busy} onClick={cancelDeletion}>
                Keep exhibition
              </button>
            </div>
          )}
        </section>
      )}
    </section>
  )
}

function parseExhibitionId(id: string | undefined): number | null {
  if (!id || !/^\d+$/.test(id)) return null
  const exhibitionId = Number(id)
  return Number.isSafeInteger(exhibitionId) && exhibitionId > 0
    ? exhibitionId
    : null
}

function InvalidExhibitionRoute() {
  return (
    <section className="state-panel editor-state" role="alert">
      <p className="eyebrow">Invalid address</p>
      <h1>Invalid exhibition address</h1>
      <p>Use an exhibition address from your curator workspace.</p>
      <Link className="text-link" to="/exhibitions">Return to exhibitions</Link>
    </section>
  )
}

function RequestError({ error }: { error: FrontendError | Error | null }) {
  if (!error) return null
  const message = isFrontendError(error)
    ? error.message
    : 'An unexpected problem occurred. Please try again.'
  return <p className="form-alert" role="alert">{message}</p>
}

function ExhibitionNotFound({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="state-panel editor-state" role="alert">
      <p className="eyebrow">Not found</p>
      <h1>Exhibition not found</h1>
      <p>This exhibition may have been deleted or the address may be incorrect.</p>
      <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button>
      <Link className="text-link" to="/exhibitions">Return to exhibitions</Link>
    </section>
  )
}

function ExhibitionLoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const message = isFrontendError(error)
    ? error.message
    : 'An unexpected problem occurred. Please try again.'
  return (
    <section className="state-panel editor-state" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1>We could not load this exhibition</h1>
      <p>{message}</p>
      <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button>
    </section>
  )
}
