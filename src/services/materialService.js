import { createMaterial } from '../domain/models.js';

export function createMaterialService({ repository }) {
  return Object.freeze({
    listMaterials: () => repository.list('materials'),
    getMaterialById: (id) => repository.findById('materials', id),
    createMaterialDraft: (values = {}) => createMaterial(values),
  });
}
