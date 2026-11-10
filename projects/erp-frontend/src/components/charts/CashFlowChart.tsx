"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/utils';

// Two series, fixed order, validated on the card surface (#141418) for
// colour-vision separation and contrast: money in is blue, money out orange.
export const FLOW_IN = '#3987e5';
export const FLOW_OUT = '#d95926';

interface CashFlowChartProps {
  data?: { name: string; incoming: number; outgoing: number }[];
}

const compact = (v: number) =>
  v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}K` : `₹${v}`;

export default function CashFlowChart({ data = [] }: CashFlowChartProps) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="0" stroke="#2A2A35" vertical={false} />
          <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={{ stroke: '#383840' }} />
          <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} width={56} tickFormatter={compact} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{ backgroundColor: '#141418', borderColor: '#2A2A35', borderRadius: '8px' }}
            labelStyle={{ color: '#F5F5F5' }}
            itemStyle={{ color: '#F5F5F5' }}
            formatter={(value: number, name: string) => [formatCurrency(value), name]}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
            formatter={(value: string) => <span style={{ color: '#9CA3AF' }}>{value}</span>}
          />
          <Bar dataKey="incoming" name="Money in" fill={FLOW_IN} radius={[4, 4, 0, 0]} maxBarSize={14} />
          <Bar dataKey="outgoing" name="Money out" fill={FLOW_OUT} radius={[4, 4, 0, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
