import { createBOMItem, createProduct } from '../domain/models.js';

export function createProductService({ repository }) {
  return Object.freeze({
    listProducts: () => repository.list('products'),
    getProductById: (id) => repository.findById('products', id),
    listBOMItems: (productId) => repository.list('bom').filter((item) => item.productId === productId),
    createProductDraft: (values = {}) => createProduct(values),
    createBOMItemDraft: (values = {}) => createBOMItem(values),
  });
}
