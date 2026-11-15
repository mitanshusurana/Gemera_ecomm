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
          <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E5" vertical={false} />
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
            tickFormatter={(value) => `${Number(value).toLocaleString()} gm`}
          />
          <Tooltip 
            cursor={{ fill: '#E0E0E5', opacity: 0.4 }}
            contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E0E0E5', borderRadius: '8px' }}
            itemStyle={{ color: '#1D1D1F' }}
            formatter={(value: number) => [`${Number(value).toLocaleString()} gm / ct`, 'Stock Balance']}
          />
          <Bar dataKey="weight" fill="#2a78d6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
