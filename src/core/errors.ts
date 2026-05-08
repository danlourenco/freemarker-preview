export type FreemarkerErrorType =
  | 'template-parse'
  | 'undefined-variable'
  | 'template-not-found'
  | 'template-runtime'
  | 'fixture-read'
  | 'fixture-parse'
  | 'internal'
  | 'daemon-crash'

export interface StructuredError {
  type: FreemarkerErrorType
  message: string
  line?: number
  column?: number
  templatePath: string
  stack?: string
}

export class FreemarkerError extends Error {
  override readonly name = 'FreemarkerError'
  readonly type: FreemarkerErrorType
  readonly line?: number
  readonly column?: number
  readonly templatePath: string

  constructor(structured: StructuredError) {
    super(structured.message)
    this.type = structured.type
    this.line = structured.line
    this.column = structured.column
    this.templatePath = structured.templatePath
  }
}
