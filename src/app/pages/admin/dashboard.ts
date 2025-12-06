import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1 class="text-3xl font-bold text-gray-900 mb-8">Dashboard Overview</h1>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <!-- Stat Card -->
      <div class="card p-6 border-l-4 border-gold-500">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-sm font-semibold text-gray-500 uppercase">Total Revenue</p>
            <h3 class="text-2xl font-bold text-gray-900 mt-1">$124,500</h3>
          </div>
          <span class="text-2xl">💰</span>
        </div>
        <p class="text-sm text-green-600 mt-4 flex items-center gap-1">
          <span class="font-bold">↑ 12%</span> vs last month
        </p>
      </div>

      <div class="card p-6 border-l-4 border-blue-500">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-sm font-semibold text-gray-500 uppercase">Total Orders</p>
            <h3 class="text-2xl font-bold text-gray-900 mt-1">45</h3>
          </div>
          <span class="text-2xl">📦</span>
        </div>
        <p class="text-sm text-green-600 mt-4 flex items-center gap-1">
          <span class="font-bold">↑ 5%</span> vs last month
        </p>
      </div>

      <div class="card p-6 border-l-4 border-purple-500">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-sm font-semibold text-gray-500 uppercase">Pending RFQs</p>
            <h3 class="text-2xl font-bold text-gray-900 mt-1">12</h3>
          </div>
          <span class="text-2xl">💬</span>
        </div>
        <p class="text-sm text-gray-600 mt-4">Requires attention</p>
      </div>

      <div class="card p-6 border-l-4 border-emerald-500">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-sm font-semibold text-gray-500 uppercase">Active Users</p>
            <h3 class="text-2xl font-bold text-gray-900 mt-1">1,250</h3>
          </div>
          <span class="text-2xl">👥</span>
        </div>
        <p class="text-sm text-green-600 mt-4 flex items-center gap-1">
          <span class="font-bold">↑ 8%</span> vs last month
        </p>
      </div>
    </div>

    <!-- Recent Activity -->
    <div class="card p-6">
      <h2 class="text-xl font-bold text-gray-900 mb-4">Recent Orders</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 text-sm font-semibold text-gray-600">Order ID</th>
              <th class="px-4 py-3 text-sm font-semibold text-gray-600">Customer</th>
              <th class="px-4 py-3 text-sm font-semibold text-gray-600">Date</th>
              <th class="px-4 py-3 text-sm font-semibold text-gray-600">Total</th>
              <th class="px-4 py-3 text-sm font-semibold text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3 font-mono text-sm">#ORD-001</td>
              <td class="px-4 py-3">John Doe</td>
              <td class="px-4 py-3 text-sm text-gray-500">Oct 24, 2023</td>
              <td class="px-4 py-3 font-semibold">$4,500</td>
              <td class="px-4 py-3"><span class="badge badge-emerald">Delivered</span></td>
            </tr>
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3 font-mono text-sm">#ORD-002</td>
              <td class="px-4 py-3">Jane Smith</td>
              <td class="px-4 py-3 text-sm text-gray-500">Oct 23, 2023</td>
              <td class="px-4 py-3 font-semibold">$12,000</td>
              <td class="px-4 py-3"><span class="badge badge-gold">Processing</span></td>
            </tr>
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3 font-mono text-sm">#ORD-003</td>
              <td class="px-4 py-3">Mike Johnson</td>
              <td class="px-4 py-3 text-sm text-gray-500">Oct 22, 2023</td>
              <td class="px-4 py-3 font-semibold">$850</td>
              <td class="px-4 py-3"><span class="badge badge-rose">Pending</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class AdminDashboardComponent {}
