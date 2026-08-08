import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isFrontendError, type FrontendError } from '../api/errors'
import {
  ExhibitionMetadataForm,
} from '../features/exhibitions/ExhibitionMetadataForm'
import { createExhibition } from '../features/exhibitions/api'
import { applyMetadataRequestError } from '../features/exhibitions/formErrors'
import {
  DirtyNavigationConfirmation,
} from '../features/exhibitions/DirtyNavigationGuard'
import { useDirtyNavigation } from '../features/exhibitions/useDirtyNavigation'
import type { MetadataFieldErrors } from '../features/exhibitions/metadataValidation'
import type { ExhibitionMetadata } from '../features/exhibitions/types'

const emptyMetadata: ExhibitionMetadata = {
  title: '',
  summary: '',
  introduction: '',
}

export function NewExhibitionPage() {
  const navigate = useNavigate()
  const [committedBaseline, setCommittedBaseline] = useState(emptyMetadata)
  const [metadata, setMetadata] = useState(emptyMetadata)
  const [fieldErrors, setFieldErrors] = useState<MetadataFieldErrors>({})
  const [error, setError] = useState<FrontendError | Error | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const requestController = useRef<AbortController | null>(null)
  const dirtyNavigation = useDirtyNavigation(!metadataMatches(metadata, committedBaseline))

  useEffect(() => () => requestController.current?.abort(), [])

  function change(field: keyof ExhibitionMetadata, value: string) {
    setMetadata((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setError(null)
  }

  async function submit() {
    if (submitting) return
    const controller = new AbortController()
    requestController.current = controller
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    try {
      const exhibition = await createExhibition(metadata, controller.signal)
      if (!controller.signal.aborted) {
        const committedMetadata = {
          title: exhibition.title,
          summary: exhibition.summary ?? '',
          introduction: exhibition.introduction ?? '',
        }
        setCommittedBaseline(committedMetadata)
        setMetadata(committedMetadata)
        const destination = `/exhibitions/${exhibition.id}/edit`
        dirtyNavigation.allowNextNavigation(destination)
        navigate(destination, { state: { createdExhibitionId: exhibition.id } })
      }
    } catch (reason) {
      if (!controller.signal.aborted) applyMetadataRequestError(reason, setFieldErrors, setError)
    } finally {
      if (!controller.signal.aborted) setSubmitting(false)
    }
  }

  return (
    <section className="editor-page">
      <div className="page-heading editor-heading">
        <p className="eyebrow">Curator workspace</p>
        <h1>Create an exhibition</h1>
        <p className="lede">Start with the narrative visitors will encounter.</p>
      </div>
      <section className="editor-section" aria-labelledby="metadata-heading">
        <h2 id="metadata-heading">Exhibition metadata</h2>
        <RequestError error={error} />
        <ExhibitionMetadataForm
          metadata={metadata}
          fieldErrors={fieldErrors}
          submitting={submitting}
          submitLabel="Create exhibition"
          onChange={change}
          onSubmit={submit}
          onClientValidationFailure={setFieldErrors}
        />
        <Link className="text-link editor-cancel" to="/exhibitions">Cancel</Link>
      </section>
      <DirtyNavigationConfirmation navigation={dirtyNavigation} />
    </section>
  )
}

function metadataMatches(draft: ExhibitionMetadata, baseline: ExhibitionMetadata): boolean {
  return draft.title === baseline.title
    && (draft.summary ?? '') === (baseline.summary ?? '')
    && (draft.introduction ?? '') === (baseline.introduction ?? '')
}

function RequestError({ error }: { error: FrontendError | Error | null }) {
  if (!error) return null
  const message = isFrontendError(error)
    ? error.message
    : 'An unexpected problem occurred. Please try again.'
  return <p className="form-alert" role="alert">{message}</p>
}
