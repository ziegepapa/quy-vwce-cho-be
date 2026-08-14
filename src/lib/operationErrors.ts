export type RecoverableOperation = "settings-save";

/**
 * Marks an operation failure that the current page can recover from without
 * replacing the whole route. The public message is intentionally generic;
 * the original reason is retained only for diagnostics and must not be rendered.
 */
export class RecoverableOperationError extends Error {
  readonly operation: RecoverableOperation;
  readonly originalReason: unknown;

  constructor(operation: RecoverableOperation, originalReason: unknown) {
    super("Recoverable operation failed");
    this.name = "RecoverableOperationError";
    this.operation = operation;
    this.originalReason = originalReason;
  }
}

export function isRecoverableOperationError(
  value: unknown,
  operation?: RecoverableOperation,
): value is RecoverableOperationError {
  return value instanceof RecoverableOperationError
    && (operation === undefined || value.operation === operation);
}
