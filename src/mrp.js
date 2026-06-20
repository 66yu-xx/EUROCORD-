export function calculateMaterialRequirements({ products, materials, bom, inventory, orders }) {
  const demand = new Map();
  const breakdown = new Map();

  for (const order of orders) {
    const orderQty = Math.max(0, Number(order.orderQty) || 0);
    const product = products.find((item) => item.id === order.productId);
    if (!product || orderQty === 0) continue;

    for (const row of bom.filter((item) => item.productId === order.productId)) {
      const qty = orderQty * Number(row.qtyPerProduct);
      demand.set(row.materialId, (demand.get(row.materialId) || 0) + qty);
      if (!breakdown.has(row.materialId)) breakdown.set(row.materialId, []);
      breakdown.get(row.materialId).push({ productCode: product.code, orderQty, qtyPerProduct: row.qtyPerProduct, qty });
    }
  }

  return materials
    .filter((material) => demand.has(material.id))
    .map((material) => {
      const inventoryRow = inventory.find((item) => item.materialId === material.id) || {};
      const requiredQty = demand.get(material.id);
      const stockQty = Number(inventoryRow.stockQty) || 0;
      const safetyStock = Number(inventoryRow.safetyStock) || 0;
      const remainingQty = stockQty - requiredQty;
      const shortageQty = Math.max(0, requiredQty - stockQty);
      const status = stockQty < requiredQty ? '缺料' : remainingQty < safetyStock ? '库存低' : '充足';
      return { ...material, requiredQty, stockQty, safetyStock, remainingQty, shortageQty, status, leadTimeDays: inventoryRow.leadTimeDays || 0, breakdown: breakdown.get(material.id) };
    })
    .sort((a, b) => ({ '缺料': 0, '库存低': 1, '充足': 2 }[a.status] - { '缺料': 0, '库存低': 1, '充足': 2 }[b.status]));
}

export function getSummary(data) {
  const results = calculateMaterialRequirements(data);
  return {
    productCount: data.products.length,
    materialCount: data.materials.length,
    shortageCount: results.filter((item) => item.status === '缺料').length,
    lowStockCount: results.filter((item) => item.status === '库存低').length,
  };
}
