"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface StockChartProps {
  data?: { name: string; weight: number }[];
}

export default function StockChart({ data = [] }: StockChartProps) {
  const chartData = data.length > 0 ? data : [
    { name: 'Gold', weight: 0 },
    { name: 'Silver', weight: 0 },
    { name: 'Diamond', weight: 0 }
  ];

  return (
    <div className="h-[300px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#2A2A35" vertical={false} />
          <XAxis 
            dataKey="name" 
            stroke="#9CA3AF" 
            fontSize={12} 
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="#9CA3AF" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${Number(value).toLocaleString()} gm`}
          />
          <Tooltip 
            cursor={{ fill: '#2A2A35', opacity: 0.4 }}
            contentStyle={{ backgroundColor: '#141418', borderColor: '#2A2A35', borderRadius: '8px' }}
            itemStyle={{ color: '#F5F5F5' }}
            formatter={(value: number) => [`${Number(value).toLocaleString()} gm / ct`, 'Stock Balance']}
          />
          <Bar dataKey="weight" fill="#D4A843" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
