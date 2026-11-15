"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/utils';

interface RevenueChartProps {
  data?: { name: string; revenue: number; expenses: number }[];
}

export default function RevenueChart({ data = [] }: RevenueChartProps) {
  const chartData = data.length > 0 ? data : [
    { name: 'Current', revenue: 0, expenses: 0 }
  ];

  return (
    <div className="h-[300px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2a78d6" stopOpacity={0.18}/>
              <stop offset="95%" stopColor="#2a78d6" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#eb6834" stopOpacity={0.18}/>
              <stop offset="95%" stopColor="#eb6834" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="0" stroke="#E0E0E5" vertical={false} />
          <XAxis 
            dataKey="name" 
            stroke="#6E6E73" 
            fontSize={12} 
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="#6E6E73" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : `₹${value}`}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E0E0E5', borderRadius: '8px' }}
            itemStyle={{ color: '#1D1D1F' }}
            formatter={(value: number, name: string) => [formatCurrency(value), name === 'revenue' ? 'Revenue' : 'Expenses']}
          />
          <Area type="monotone" dataKey="revenue" name="revenue" stroke="#2a78d6" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
          <Area type="monotone" dataKey="expenses" name="expenses" stroke="#eb6834" strokeWidth={2} fillOpacity={1} fill="url(#colorExpenses)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
