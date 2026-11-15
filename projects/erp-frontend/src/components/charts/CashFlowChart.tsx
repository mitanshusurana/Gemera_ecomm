"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/utils';

// Two series, fixed order, validated on the white card surface for
// colour-vision separation and contrast: money in is blue, money out orange.
export const FLOW_IN = '#2a78d6';
export const FLOW_OUT = '#eb6834';

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
          <CartesianGrid strokeDasharray="0" stroke="#E0E0E5" vertical={false} />
          <XAxis dataKey="name" stroke="#6E6E73" fontSize={12} tickLine={false} axisLine={{ stroke: '#C7C7CC' }} />
          <YAxis stroke="#6E6E73" fontSize={12} tickLine={false} axisLine={false} width={56} tickFormatter={compact} />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E0E0E5', borderRadius: '8px' }}
            labelStyle={{ color: '#1D1D1F' }}
            itemStyle={{ color: '#1D1D1F' }}
            formatter={(value: number, name: string) => [formatCurrency(value), name]}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
            formatter={(value: string) => <span style={{ color: '#6E6E73' }}>{value}</span>}
          />
          <Bar dataKey="incoming" name="Money in" fill={FLOW_IN} radius={[4, 4, 0, 0]} maxBarSize={14} />
          <Bar dataKey="outgoing" name="Money out" fill={FLOW_OUT} radius={[4, 4, 0, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
