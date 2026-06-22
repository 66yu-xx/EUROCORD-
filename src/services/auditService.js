import { createAuditItem, createPendingDocument } from '../domain/models.js';

export function createAuditService({ repository }) {
  return Object.freeze({
    listPendingDocuments: () => repository.list('pendingDocuments'),
    listAuditItems: () => repository.list('auditItems'),
    createPendingDocumentDraft: (values = {}) => createPendingDocument(values),
    createAuditItemDraft: (values = {}) => createAuditItem(values),
  });
}
