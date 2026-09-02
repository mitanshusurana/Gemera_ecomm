import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
  }).format(amount);
}

export function formatWeight(grams: number): string {
  return `${grams.toFixed(3)} gm`;
}

export function formatDate(dateStr: string | Date): string {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return format(date, 'dd MMM yyyy');
}

export function calculateJewelryGST(materialValue: number, makingCharges: number, isInterState: boolean = false) {
  const materialGST = materialValue * 0.03;
  const makingGST = makingCharges * 0.05;
  const totalGST = materialGST + makingGST;
  
  if (isInterState) {
    return {
      igst: totalGST,
      cgst: 0,
      sgst: 0,
      totalGST
    };
  } else {
    return {
      igst: 0,
      cgst: totalGST / 2,
      sgst: totalGST / 2,
      totalGST
    };
  }
}
