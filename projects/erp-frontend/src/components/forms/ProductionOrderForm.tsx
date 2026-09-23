"use client";

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface ProductionOrderFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function ProductionOrderForm({ onSuccess, onCancel }: ProductionOrderFormProps) {
  const [productName, setProductName] = useState('22K Gold Bridal Necklace');
  const [plannedQty, setPlannedQty] = useState('1');
  const [artisanName, setArtisanName] = useState('Ramesh Kumar (Goldsmith)');
  const [allowedWastage, setAllowedWastage] = useState('2.5');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName) {
      setError('Please enter a product name.');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      await apiClient.post('/production/orders', {
        product_name: productName,
        planned_qty: Number(plannedQty || 1),
        allowed_wastage_pct: Number(allowedWastage || 2.5),
        remarks: remarks || `Order for ${productName} assigned to ${artisanName}`,
        reason: 'Production Order Release'
      });
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Failed to create production order:', err);
      setError(err.response?.data?.detail || 'Failed to release order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm text-textSecondary">Product Name / Design</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-white focus:border-primary outline-none"
            placeholder="e.g. 22K Gold Necklace"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-textSecondary">Artisan / Karigar</label>
          <select
            value={artisanName}
            onChange={(e) => setArtisanName(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-white focus:border-primary outline-none"
          >
            <option>Ramesh Kumar (Goldsmith)</option>
            <option>Suresh Singh (Diamond Setter)</option>
            <option>Govind Sharma (Polisher & Finisher)</option>
            <option>Deepak Verma (Master Artisan)</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-lg font-playfair font-medium text-white">Target Output & Specifications</h4>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm text-textSecondary">Quantity (Units / Pieces)</label>
            <input
              type="number"
              min="1"
              value={plannedQty}
              onChange={(e) => setPlannedQty(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-white focus:border-primary outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-textSecondary">Allowed Wastage / Melting Loss (%)</label>
            <input
              type="number"
              step="0.1"
              value={allowedWastage}
              onChange={(e) => setAllowedWastage(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-white focus:border-primary outline-none"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-textSecondary">Order Notes & Instructions</label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={2}
          placeholder="Hallmarking standard: 916 BIS, Net weight tolerance +/- 0.05gm"
          className="w-full bg-background border border-border rounded-lg px-4 py-2 text-white focus:border-primary outline-none text-sm"
        />
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 rounded-lg border border-border text-white hover:bg-surface transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 px-6 py-2 rounded-lg bg-gold-gradient text-background font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Release Order to Karigar
        </button>
      </div>
    </form>
  );
}
